import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { IssuerLead, IssuerLeadStatus } from '../entities/issuer-lead.entity';
import { Tenant, TenantPlan, TenantStatus } from '../../admin/entities/tenant.entity';
import { User, UserRole, UserStatus } from '../../auth/entities/user.entity';
import { CreateIssuerLeadDto } from '../dto/create-issuer-lead.dto';
import { AuditLogService } from '../../admin/services/audit-log.service';
import { EmailService } from '../../notifications/services/email.service';

export interface IssuerLeadListResult {
  data: IssuerLead[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function cleanUploadUrl(url?: string | null): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, '');
}

@Injectable()
export class IssuerLeadsService {
  private readonly logger = new Logger(IssuerLeadsService.name);

  constructor(
    @InjectRepository(IssuerLead)
    private readonly leadRepo: Repository<IssuerLead>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
    private readonly emailService: EmailService,
  ) {}

  // ─── Public ────────────────────────────────────────────────────

  /**
   * File the application for an already signed-up issuer.
   *
   * The account (name, email, password) and its email OTP were handled at
   * signup, so the application is tied to that account and only needs to
   * land in the admin queue.
   */
  async submit(dto: CreateIssuerLeadDto, userId: string): Promise<IssuerLead> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Issuer account not found');
    }
    dto.email = user.email.toLowerCase();
    await this.assertEmailCanApply(dto.email);

    const fullName = (
      dto.authorized_representative_name ||
      dto.full_name ||
      `${dto.first_name || ''} ${dto.last_name || ''}`
    ).trim();

    let firstName = dto.first_name?.trim();
    let lastName = dto.last_name?.trim();
    if (!firstName && fullName) {
      const parts = fullName.split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(' ') || parts[0];
    }

    const lead = this.leadRepo.create({
      firstName: firstName || 'Issuer',
      lastName: lastName || 'Lead',
      email: dto.email,
      companyName: dto.company_name,
      jobTitle: dto.job_title ?? null,
      companyType: dto.company_type ?? null,
      phoneNumber: dto.phone_number ?? null,
      website: dto.website ?? null,
      country: dto.country,
      comments: dto.comments ?? null,
      registeredAddress: dto.registered_address ?? null,
      addressLine2: dto.address_line_2 ?? null,
      city: dto.city ?? null,
      stateProvince: dto.state_province ?? null,
      postalCode: dto.postal_code ?? null,
      isOperatingAddressSame: dto.is_operating_address_same ?? true,
      operatingAddress:
        dto.is_operating_address_same === false
          ? dto.operating_address ?? null
          : null,
      authorizedRepresentativeName: fullName || null,
      nationality: dto.nationality ?? null,
      identityDocumentType: dto.identity_document_type ?? null,
      identityDocumentNumber: dto.identity_document_number ?? null,
      proofOfIdentityUrl: cleanUploadUrl(dto.proof_of_identity_url),
      proofOfIdentityName: dto.proof_of_identity_name ?? null,
      authorizationLetterUrl: cleanUploadUrl(dto.authorization_letter_url),
      authorizationLetterName: dto.authorization_letter_name ?? null,
      status: IssuerLeadStatus.PENDING,
    });

    const saved = await this.leadRepo.save(lead);

    saved.issuerUserId = user.id;
    await this.leadRepo.save(saved);

    this.logger.log(`Issuer lead submitted: ${saved.email} (${saved.companyName})`);

    this.auditLog
      .create({
        tenant_id: 'system',
        actor_id: saved.id,
        actor_role: 'public',
        action: 'issuer_lead.submit',
        resource_type: 'issuer_lead',
        resource_id: saved.id,
        details: { email: saved.email, company: saved.companyName },
      })
      .catch(() => {});

    return saved;
  }

  async getStatusById(id: string): Promise<Pick<IssuerLead, 'id' | 'status' | 'createdAt'>> {
    const lead = await this.leadRepo.findOne({ where: { id }, select: ['id', 'status', 'createdAt'] });
    if (!lead) {
      throw new NotFoundException('Application not found');
    }
    return lead;
  }

  /** Latest application for the signed-in issuer, for the dashboard status card. */
  async getMyStatus(userId: string): Promise<{
    status: IssuerLeadStatus | 'not_submitted';
    leadId: string | null;
    companyName: string | null;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    rejectionReason: string | null;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Issuer account not found');

    const lead = await this.leadRepo.findOne({
      where: { email: user.email.toLowerCase() },
      order: { createdAt: 'DESC' },
    });
    if (!lead) {
      return {
        status: 'not_submitted',
        leadId: null,
        companyName: null,
        submittedAt: null,
        reviewedAt: null,
        rejectionReason: null,
      };
    }
    return {
      status: lead.status,
      leadId: lead.id,
      companyName: lead.companyName,
      submittedAt: lead.createdAt,
      reviewedAt: lead.reviewedAt,
      rejectionReason: lead.rejectionReason,
    };
  }

  // ─── Admin ─────────────────────────────────────────────────────

  async findAll(
    page = 1,
    limit = 20,
    status?: IssuerLeadStatus,
    search?: string,
  ): Promise<IssuerLeadListResult> {
    const qb = this.leadRepo.createQueryBuilder('lead');

    if (status) {
      qb.andWhere('lead.status = :status', { status });
    }

    if (search) {
      qb.andWhere(
        '(lead.email ILIKE :q OR lead.company_name ILIKE :q OR lead.first_name ILIKE :q OR lead.last_name ILIKE :q)',
        { q: `%${search}%` },
      );
    }

    qb.orderBy('lead.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((l) => this.sanitizeLead(l)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<IssuerLead> {
    const lead = await this.leadRepo.findOne({ where: { id } });
    if (!lead) {
      throw new NotFoundException(`Issuer lead ${id} not found`);
    }
    return this.sanitizeLead(lead);
  }

  private sanitizeLead(lead: IssuerLead): IssuerLead {
    if (lead.proofOfIdentityUrl) {
      lead.proofOfIdentityUrl = cleanUploadUrl(lead.proofOfIdentityUrl);
    }
    if (lead.authorizationLetterUrl) {
      lead.authorizationLetterUrl = cleanUploadUrl(lead.authorizationLetterUrl);
    }
    return lead;
  }

  async approve(
    id: string,
    adminId: string | null,
    plan = 'starter',
    slugOverride?: string,
    customDomain?: string,
  ): Promise<{ lead: IssuerLead; tempPassword: string }> {
    const lead = await this.findById(id);

    if (lead.status !== IssuerLeadStatus.PENDING) {
      throw new BadRequestException(`Lead is already ${lead.status}. Only pending leads can be approved.`);
    }

    // The account was created at signup with the issuer's own password, so approval attaches a tenant rather than issuing credentials.
    // Only a lead with no account at all (pre-OTP data) still needs one.
    const existingUser = await this.userRepo.findOne({ where: { email: lead.email } });

    // Use provided slug or auto-generate from company name
    const slug = slugOverride
      ? await this.validateAndReserveSlug(slugOverride)
      : await this.generateUniqueSlug(lead.companyName);

    const tempPassword = existingUser ? '' : this.generatePassword();
    const passwordHash = existingUser ? null : await bcrypt.hash(tempPassword, 12);
    const resetToken = crypto.randomBytes(32).toString('hex');

    let savedTenant!: Tenant;
    let savedUser!: User;
    let updatedLead!: IssuerLead;

    await this.dataSource.transaction(async (manager) => {
      // 1. Create tenant
      const tenant = manager.create(Tenant, {
        name: lead.companyName,
        slug,
        domain: customDomain ?? null,
        plan: (plan as TenantPlan) ?? TenantPlan.STARTER,
        status: TenantStatus.ACTIVE,
        settings: {},
      });
      savedTenant = await manager.save(tenant);

      const userName = (lead.authorizedRepresentativeName || `${lead.firstName} ${lead.lastName}`).trim();

      if (existingUser) {
        // Attach the tenant to the account they already signed up with; their
        // existing password keeps working.
        existingUser.tenantId = savedTenant.id;
        existingUser.status = UserStatus.ACTIVE;
        existingUser.role = UserRole.ISSUER;
        existingUser.name = existingUser.name || userName || 'Issuer Admin';
        savedUser = await manager.save(existingUser);
      } else {
        const user = manager.create(User, {
          email: lead.email,
          name: userName || 'Issuer Admin',
          passwordHash,
          role: UserRole.ISSUER,
          tenantId: savedTenant.id,
          status: UserStatus.ACTIVE,
          isEmailVerified: true,
          phone: lead.phoneNumber ?? null,
          passwordResetToken: resetToken,
          passwordResetExpires: new Date(Date.now() + 7 * 24 * 3600_000),
        });
        savedUser = await manager.save(user);
      }

      // 3. Update lead atomically
      lead.status = IssuerLeadStatus.APPROVED;
      lead.reviewedBy = adminId ?? null;
      lead.reviewedAt = new Date();
      lead.tenantId = savedTenant.id;
      lead.issuerUserId = savedUser.id;
      updatedLead = await manager.save(IssuerLead, lead);
    });

    // 4. Create schema outside transaction (DDL can't be transactional in PG)
    await this.createTenantSchema(slug);

    // 5. Notify the applicant.
    //
    // Normally the password reached them with the signup OTP, so approval only
    // announces that the account is now open. Leads created before that flow
    // existed have no credentials yet, so those get the generated password here
    // — otherwise they would be approved with no way to sign in.
    if (existingUser) {
      await this.emailService
        .sendEmail({
          to: lead.email,
          subject: `Your ${lead.companyName} issuer account is approved`,
          text:
            `Good news — your issuer application for ${lead.companyName} has been approved.\n\n` +
            `You can now sign in at ${this.issuerLoginUrl()} with ${lead.email} ` +
            `and the password you chose when you signed up.`,
          html:
            `<p>Good news — your issuer application for <strong>${lead.companyName}</strong> has been approved.</p>` +
            `<p>You can now sign in at <a href="${this.issuerLoginUrl()}">the issuer portal</a> with ` +
            `<strong>${lead.email}</strong> and the password you chose when you signed up.</p>`,
        })
        .catch((err: Error) =>
          this.logger.error(`Approval email failed for ${lead.email}: ${err.message}`),
        );
    } else {
      await this.emailService
        .sendEmail({
          to: lead.email,
          subject: `Your ${lead.companyName} issuer account is ready`,
          text:
            `Your issuer application for ${lead.companyName} has been approved.\n\n` +
            `Sign in at ${this.issuerLoginUrl()}\n` +
            `  Email:    ${lead.email}\n  Password: ${tempPassword}\n\n` +
            `Please change this password after your first sign-in.`,
          html:
            `<p>Your issuer application for <strong>${lead.companyName}</strong> has been approved.</p>` +
            `<p>Sign in at <a href="${this.issuerLoginUrl()}">the issuer portal</a>:</p>` +
            `<p>Email: <strong>${lead.email}</strong><br/>Password: <strong>${tempPassword}</strong></p>` +
            `<p>Please change this password after your first sign-in.</p>`,
        })
        .catch((err: Error) =>
          this.logger.error(`Approval email failed for ${lead.email}: ${err.message}`),
        );
      this.logger.log(
        `[APPROVAL] Legacy lead ${lead.email} had no account — credentials generated and emailed.`,
      );
    }

    this.auditLog
      .create({
        tenant_id: savedTenant.id,
        actor_id: adminId ?? 'system',
        actor_role: 'admin',
        action: 'issuer_lead.approve',
        resource_type: 'issuer_lead',
        resource_id: id,
        details: { email: lead.email, tenantId: savedTenant.id, userId: savedUser.id },
      })
      .catch(() => {});

    this.logger.log(`Issuer lead approved: ${lead.email} → tenant ${slug}, user ${savedUser.id}`);

    return { lead: updatedLead, tempPassword };
  }

  async reject(id: string, adminId: string | null, rejectionReason: string): Promise<IssuerLead> {
    const lead = await this.findById(id);

    if (lead.status !== IssuerLeadStatus.PENDING) {
      throw new BadRequestException(`Lead is already ${lead.status}. Only pending leads can be rejected.`);
    }

    lead.status = IssuerLeadStatus.REJECTED;
    lead.rejectionReason = rejectionReason;
    lead.reviewedBy = adminId ?? null;
    lead.reviewedAt = new Date();
    const updated = await this.leadRepo.save(lead);

    await this.emailService
      .sendEmail({
        to: lead.email,
        subject: `Update on your ${lead.companyName} issuer application`,
        text:
          `Thank you for your interest in Assetro.\n\n` +
          `After review, your issuer application for ${lead.companyName} has not been approved.\n\n` +
          `Reason: ${rejectionReason}\n\n` +
          `If you believe this is a mistake, please reply to this email.`,
        html:
          `<p>Thank you for your interest in Assetro.</p>` +
          `<p>After review, your issuer application for <strong>${lead.companyName}</strong> has not been approved.</p>` +
          `<p><strong>Reason:</strong> ${rejectionReason}</p>` +
          `<p>If you believe this is a mistake, please reply to this email.</p>`,
      })
      .catch((err: Error) =>
        this.logger.error(`Rejection email failed for ${lead.email}: ${err.message}`),
      );

    this.auditLog
      .create({
        tenant_id: 'system',
        actor_id: adminId ?? 'system',
        actor_role: 'admin',
        action: 'issuer_lead.reject',
        resource_type: 'issuer_lead',
        resource_id: id,
        details: { email: lead.email, reason: rejectionReason },
      })
      .catch(() => {});

    this.logger.log(`Issuer lead rejected: ${lead.email} — ${rejectionReason}`);
    return updated;
  }

  async getStats(): Promise<{ total: number; pending: number; approved: number; rejected: number }> {
    const rows = await this.leadRepo
      .createQueryBuilder('lead')
      .select('lead.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('lead.status')
      .getRawMany();

    const stats = { total: 0, pending: 0, approved: 0, rejected: 0 };
    for (const row of rows) {
      const count = parseInt(row.count, 10);
      stats.total += count;
      if (row.status in stats) {
        (stats as Record<string, number>)[row.status] = count;
      }
    }
    return stats;
  }

  // ─── Helpers ───────────────────────────────────────────────────

  /**
   * Reject an address that already has a pending or approved application.
   * A rejected application may be resubmitted.
   */
  private async assertEmailCanApply(email: string): Promise<void> {
    const existing = await this.leadRepo.findOne({
      where: { email: email.toLowerCase() },
      order: { createdAt: 'DESC' },
    });

    if (existing && existing.status === IssuerLeadStatus.PENDING) {
      throw new ConflictException(
        'An application for this email is already under review.',
      );
    }

    if (existing && existing.status === IssuerLeadStatus.APPROVED) {
      throw new ConflictException(
        'This email has already been approved. Please use the issuer login page.',
      );
    }
  }

  /** Issuer sign-in page; the issuer portal is served by the platform web app. */
  issuerLoginUrl(): string {
    const base = process.env.NEXT_PUBLIC_INVESTOR_URL || 'http://localhost:3001';
    return `${base.replace(/\/$/, '')}/issuer/login`;
  }

  /** 16 chars with the mixed-case/digit/symbol shape the login form expects. */
  private generatePassword(): string {
    return crypto.randomBytes(10).toString('base64url').slice(0, 12) + 'Aa1!';
  }

  private async validateAndReserveSlug(slug: string): Promise<string> {
    const existing = await this.tenantRepo.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(`Slug "${slug}" is already taken. Please choose a different one.`);
    }
    return slug;
  }

  private async generateUniqueSlug(companyName: string): Promise<string> {
    const base = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    let slug = base;
    let i = 2;
    while (await this.tenantRepo.findOne({ where: { slug } })) {
      slug = `${base}-${i++}`;
    }
    return slug;
  }

  private async createTenantSchema(slug: string): Promise<void> {
    const schemaName = `tenant_${slug.replace(/-/g, '_')}`;
    try {
      await this.dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      this.logger.log(`Schema created: ${schemaName}`);
    } catch (err) {
      this.logger.error(`Schema creation failed for ${schemaName}: ${(err as Error).message}`);
    }
  }
}
