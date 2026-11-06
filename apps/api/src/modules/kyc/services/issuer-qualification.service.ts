import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  IssuerInvestorQualification,
  QualificationStatus,
} from '../entities/issuer-investor-qualification.entity';
import { AdminKycStatus, InvestorProfile } from '../entities/investor-profile.entity';
import { resolveAdminKycStatus } from './admin-kyc-status';
import { KycDocument } from '../entities/kyc-document.entity';
import { InvestorClaim, ClaimStatus } from '../entities/investor-claim.entity';
import { ReviewQualificationDto } from '../dto/review-qualification.dto';
import { User, UserRole, UserStatus } from '../../auth/entities/user.entity';
import { Token } from '../../tokens/entities/token.entity';
import { KycSubmission, InvestorType, AccreditationStatus } from '../entities/kyc-submission.entity';
import { IdentityDeploymentService } from '../../identity/services/identity-deployment.service';
import {
  ClaimIssuanceService,
  CLAIM_TOPICS,
  CLAIM_TOPIC_NAMES as CLAIM_TOPIC_NAMES_FROM_SERVICE,
  IssueClaimResult,
} from '../../identity/services/claim-issuance.service';
import { IdentityRegistryService } from '../../identity/services/identity-registry.service';
import { BlockchainSyncService } from '../../identity/services/blockchain-sync.service';
import { WhitelistService } from '../../compliance/services/whitelist.service';
import { InvestorType as WhitelistInvestorType } from '../../compliance/entities/whitelist.entity';
import {
  INVESTOR_QUALIFICATION_QUEUE,
  QUALIFICATION_JOB_NAME,
  QualificationJobData,
} from '../queues/investor-qualification.queue';

const COUNTRY_CODES: Record<string, number> = {
  IN: 356, US: 840, GB: 826, DE: 276, FR: 250, SG: 702, AE: 784,
  JP: 392, CN: 156, AU: 36, CA: 124, BR: 76, ZA: 710, NG: 566,
};

const CLAIM_TOPIC_NAMES = CLAIM_TOPIC_NAMES_FROM_SERVICE;

function toWhitelistType(t: InvestorType): WhitelistInvestorType {
  if (t === InvestorType.INSTITUTIONAL) return WhitelistInvestorType.INSTITUTIONAL;
  if (t === InvestorType.ACCREDITED) return WhitelistInvestorType.ACCREDITED;
  return WhitelistInvestorType.RETAIL;
}

export interface QualificationResult {
  qualification: IssuerInvestorQualification;
  identityAddress: string | null;
}

@Injectable()
export class IssuerQualificationService {
  private readonly logger = new Logger(IssuerQualificationService.name);

  constructor(
    @InjectRepository(IssuerInvestorQualification)
    private readonly qualRepo: Repository<IssuerInvestorQualification>,
    @InjectRepository(InvestorProfile)
    private readonly profileRepo: Repository<InvestorProfile>,
    @InjectRepository(InvestorClaim)
    private readonly claimRepo: Repository<InvestorClaim>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
    @InjectRepository(KycDocument)
    private readonly documentRepo: Repository<KycDocument>,
    private readonly identityDeployment: IdentityDeploymentService,
    private readonly claimIssuance: ClaimIssuanceService,
    private readonly identityRegistry: IdentityRegistryService,
    private readonly blockchainSync: BlockchainSyncService,
    private readonly whitelist: WhitelistService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectQueue(INVESTOR_QUALIFICATION_QUEUE)
    private readonly qualificationQueue: Queue<QualificationJobData>,
  ) {}

  /** Platform-admin KYC level for an investor (explicit, or derived for pre-split profiles). */
  async getAdminKycStatus(investorId: string): Promise<AdminKycStatus> {
    return resolveAdminKycStatus(
      {
        profileRepo: this.profileRepo,
        qualRepo: this.qualRepo,
        kycRepo: this.dataSource.getRepository(KycSubmission),
      },
      investorId,
    );
  }

  /**
   * Request approval from one issuer. Only admin-approved investors may ask an
   * issuer; `skipAdminCheck` is for the automatic request created when a profile
   * is first submitted, which is what the admin reviews.
   */
  async requestQualification(
    investorId: string,
    issuerId: string,
    opts: { skipAdminCheck?: boolean } = {},
  ): Promise<IssuerInvestorQualification> {
    if (!opts.skipAdminCheck) {
      const adminStatus = await this.getAdminKycStatus(investorId);
      if (adminStatus !== AdminKycStatus.APPROVED) {
        throw new BadRequestException(
          adminStatus === AdminKycStatus.PENDING
            ? 'Your KYC must be approved by the platform admin before you can request issuer approval.'
            : `Your platform KYC is "${adminStatus}". Admin approval is required before you can request issuer approval.`,
        );
      }
    }

    const profile = await this.profileRepo.findOne({ where: { userId: investorId } });
    if (!profile) {
      throw new BadRequestException(
        'You must submit your KYC profile before requesting issuer qualification.',
      );
    }

    const existing = await this.qualRepo.findOne({ where: { issuerId, investorId } });

    if (existing) {
      if (existing.status === QualificationStatus.APPROVED) {
        throw new ConflictException('You are already approved by this issuer.');
      }
      if ([QualificationStatus.PENDING, QualificationStatus.UNDER_REVIEW].includes(existing.status)) {
        return existing;
      }
      // Rejected, expired or revoked — allow re-request
      existing.status = QualificationStatus.PENDING;
      existing.revokedAt = null;
      existing.revokedBy = null;
      existing.revokedReason = null;
      existing.reviewedBy = null;
      existing.reviewedAt = null;
      existing.approvedAt = null;
      existing.rejectedReason = null;
      existing.reviewNotes = null;
      existing.profileId = profile.id;
      this.logger.log(`Re-requested qualification: investor ${investorId} → issuer ${issuerId}`);
      return this.qualRepo.save(existing);
    }

    const qual = this.qualRepo.create({
      issuerId,
      investorId,
      profileId: profile.id,
      status: QualificationStatus.PENDING,
    });
    const saved = await this.qualRepo.save(qual);
    this.logger.log(`Qualification requested: investor ${investorId} → issuer ${issuerId}`);
    return saved;
  }

  async listForIssuer(
    issuerId: string,
    page = 1,
    limit = 20,
    status?: QualificationStatus,
  ): Promise<{ data: IssuerInvestorQualification[]; total: number; page: number; limit: number }> {
    await this.markExpired({ issuerId });
    const qb = this.qualRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.profile', 'profile')
      .where('q.issuerId = :issuerId', { issuerId });

    if (status) qb.andWhere('q.status = :status', { status });

    const [data, total] = await qb
      .orderBy('q.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async listAllForAdmin(
    page = 1,
    limit = 20,
    status?: QualificationStatus,
    search?: string,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const qb = this.qualRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.profile', 'profile');

    if (status) {
      qb.andWhere('q.status = :status', { status });
    }

    if (search && search.trim()) {
      const s = `%${search.trim().toLowerCase()}%`;
      const matchingUsers = await this.userRepo
        .createQueryBuilder('u')
        .where('LOWER(u.name) LIKE :s OR LOWER(u.email) LIKE :s OR LOWER(u.wallet_address) LIKE :s', { s })
        .select('u.id')
        .getMany();
      const matchingUserIds = matchingUsers.map((u) => u.id);

      if (matchingUserIds.length > 0) {
        qb.andWhere(
          '(LOWER(profile.fullName) LIKE :s OR LOWER(profile.country) LIKE :s OR q.investorId IN (:...matchingUserIds))',
          { s, matchingUserIds },
        );
      } else {
        qb.andWhere(
          '(LOWER(profile.fullName) LIKE :s OR LOWER(profile.country) LIKE :s)',
          { s },
        );
      }
    }

    const [quals, total] = await qb
      .orderBy('q.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const userIds = Array.from(new Set(quals.map((q) => q.investorId)));
    const profileIds = Array.from(new Set(quals.map((q) => q.profileId).filter(Boolean)));

    const [users, documents] = await Promise.all([
      userIds.length > 0
        ? this.userRepo.find({
            where: { id: In(userIds) },
            select: [
              'id',
              'email',
              'name',
              'role',
              'status',
              'phone',
              'walletAddress',
              'identityContractAddress',
              'createdAt',
            ],
          })
        : [],
      profileIds.length > 0
        ? this.documentRepo.find({
            where: { profileId: In(profileIds) },
            order: { uploadedAt: 'DESC' },
          })
        : [],
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const docsByProfile = new Map<string, KycDocument[]>();
    for (const doc of documents) {
      if (doc.profileId) {
        const arr = docsByProfile.get(doc.profileId) || [];
        arr.push(doc);
        docsByProfile.set(doc.profileId, arr);
      }
    }

    const data = quals.map((q) => {
      const docs = docsByProfile.get(q.profileId) || [];
      if (q.profile) {
        q.profile.documents = docs;
      }
      return {
        ...q,
        investor: userMap.get(q.investorId) || null,
        documents: docs,
      };
    });

    return { data, total, page, limit };
  }

  async getAdminStats(): Promise<Record<string, number>> {
    const rows = await this.qualRepo
      .createQueryBuilder('q')
      .select('q.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('q.status')
      .getRawMany<{ status: string; count: string }>();

    const stats: Record<string, number> = {
      total: 0,
      pending: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
    };
    for (const row of rows) {
      const n = parseInt(row.count, 10);
      stats.total += n;
      if (row.status in stats) stats[row.status] = n;
    }
    return stats;
  }

  /** Returns approved investors with their wallet addresses — used by the whitelist page. */
  async getApprovedInvestorsWithWallets(issuerId: string): Promise<
    Array<{ investorId: string; name: string; email: string; walletAddress: string | null; identityContractAddress: string | null }>
  > {
    const quals = await this.qualRepo.find({
      where: { issuerId, status: QualificationStatus.APPROVED },
      relations: ['profile'],
      order: { approvedAt: 'DESC' },
    });

    const seen = new Set<string>();
    const result = [];
    for (const q of quals) {
      if (seen.has(q.investorId)) continue;
      seen.add(q.investorId);
      const user = await this.userRepo.findOne({ where: { id: q.investorId } });
      result.push({
        investorId: q.investorId,
        name: q.profile?.fullName ?? user?.name ?? 'Unknown',
        email: user?.email ?? '',
        walletAddress: user?.walletAddress ?? null,
        identityContractAddress: user?.identityContractAddress ?? null,
      });
    }
    return result;
  }

  async getQualification(id: string): Promise<IssuerInvestorQualification & { investor?: Partial<User> | null }> {
    const qual = await this.qualRepo.findOne({
      where: { id },
      relations: ['profile', 'profile.documents'],
    });
    if (!qual) throw new NotFoundException(`Qualification ${id} not found`);

    if (qual.profile) {
      if (!qual.profile.documents || qual.profile.documents.length === 0) {
        // Query by profileId or any KYC submission linked to this investor
        let submissionIds: string[] = [];
        try {
          const subs = await this.dataSource.getRepository(KycSubmission).find({
            where: { userId: qual.investorId },
            select: ['id'],
          });
          submissionIds = subs.map((s) => s.id);
        } catch {
          submissionIds = [];
        }

        const conditions: any[] = [
          { profileId: qual.profileId },
          { profileId: qual.profile.id },
          { kycSubmissionId: qual.id },
        ];
        submissionIds.forEach((sid: string) => conditions.push({ kycSubmissionId: sid }));

        qual.profile.documents = await this.documentRepo.find({
          where: conditions,
          order: { uploadedAt: 'DESC' },
        });
      }
    }

    const user = await this.userRepo.findOne({
      where: { id: qual.investorId },
      select: ['id', 'email', 'name', 'role', 'status', 'phone', 'walletAddress', 'identityContractAddress', 'createdAt'],
    });

    (qual as any).investor = user || null;
    return qual as IssuerInvestorQualification & { investor?: Partial<User> | null };
  }

  async getMyQualifications(investorId: string): Promise<IssuerInvestorQualification[]> {
    await this.markExpired({ investorId });
    return this.qualRepo.find({
      where: { investorId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Flip approvals past their expiry date to EXPIRED so every screen shows the same state. */
  private async markExpired(where: { investorId?: string; issuerId?: string }): Promise<void> {
    await this.qualRepo
      .createQueryBuilder()
      .update(IssuerInvestorQualification)
      .set({ status: QualificationStatus.EXPIRED })
      .where('status = :approved AND expires_at IS NOT NULL AND expires_at < NOW()', {
        approved: QualificationStatus.APPROVED,
      })
      .andWhere(where.investorId ? 'investor_id = :investorId' : '1=1', { investorId: where.investorId })
      .andWhere(where.issuerId ? 'issuer_id = :issuerId' : '1=1', { issuerId: where.issuerId })
      .execute();
  }

  /**
   * Withdraw an issuer's approval. The issuer may revoke their own investors;
   * an admin may revoke any. The investor must request approval again.
   */
  async revokeQualification(
    id: string,
    byId: string,
    byRole: UserRole,
    reason: string,
  ): Promise<IssuerInvestorQualification> {
    const qual = await this.getQualification(id);
    if (byRole === UserRole.ISSUER && qual.issuerId !== byId) {
      throw new BadRequestException('You are not the issuer for this qualification.');
    }
    if (qual.status === QualificationStatus.REVOKED) {
      throw new BadRequestException('This approval is already revoked.');
    }
    qual.status = QualificationStatus.REVOKED;
    qual.revokedAt = new Date();
    qual.revokedBy = byId;
    qual.revokedReason = reason;
    qual.approvedAt = null;
    qual.expiresAt = null;
    const saved = await this.qualRepo.save(qual);
    this.logger.log(`Qualification ${id} REVOKED by ${byRole} ${byId}`);
    return saved;
  }

  /** Admin withdraws an investor's platform KYC: blocks them with every issuer. */
  async revokeAdminKyc(investorId: string, adminId: string, reason: string): Promise<InvestorProfile> {
    const profile = await this.profileRepo.findOne({ where: { userId: investorId } });
    if (!profile) throw new NotFoundException('Investor profile not found.');
    profile.adminKycStatus = AdminKycStatus.REVOKED;
    profile.adminReviewedBy = adminId;
    profile.adminReviewedAt = new Date();
    profile.adminReason = reason;
    const saved = await this.profileRepo.save(profile);
    this.logger.log(`Admin KYC for investor ${investorId} REVOKED by ${adminId}`);
    return saved;
  }

  async getByPair(issuerId: string, investorId: string): Promise<IssuerInvestorQualification | null> {
    return this.qualRepo.findOne({ where: { issuerId, investorId } });
  }

  async reviewQualification(
    id: string,
    reviewerId: string,
    reviewerRole: UserRole,
    dto: ReviewQualificationDto,
  ): Promise<QualificationResult> {
    const qual = await this.getQualification(id);

    // Issuers may only review their own investors; agents (compliance/transfer) can review any
    if (reviewerRole === UserRole.ISSUER && qual.issuerId !== reviewerId) {
      throw new BadRequestException('You are not the issuer for this qualification.');
    }

    if (qual.status === QualificationStatus.APPROVED && dto.status === QualificationStatus.APPROVED) {
      throw new BadRequestException('This investor is already approved.');
    }

    const isAdmin = reviewerRole === UserRole.ADMIN;

    // The two approval levels are separate. The issuer can only decide once the
    // platform admin has approved the investor's KYC.
    if (!isAdmin && dto.status === QualificationStatus.APPROVED) {
      const adminStatus = await this.getAdminKycStatus(qual.investorId);
      if (adminStatus !== AdminKycStatus.APPROVED) {
        throw new BadRequestException(
          'This investor has not been approved by the platform admin yet, so issuer approval is not possible.',
        );
      }
    }

    // An admin decision is the platform level: it records the admin status on the
    // profile and leaves the issuer's own decision (the qualification) to the issuer.
    if (isAdmin) {
      const profile = await this.profileRepo.findOne({ where: { userId: qual.investorId } });
      if (profile && dto.status !== QualificationStatus.UNDER_REVIEW) {
        profile.adminKycStatus =
          dto.status === QualificationStatus.APPROVED ? AdminKycStatus.APPROVED : AdminKycStatus.REJECTED;
        profile.adminReviewedBy = reviewerId;
        profile.adminReviewedAt = new Date();
        profile.adminReason = dto.rejected_reason ?? dto.review_notes ?? null;
        await this.profileRepo.save(profile);
      }
      if (dto.status === QualificationStatus.APPROVED) {
        await this.userRepo.update(qual.investorId, { status: UserStatus.ACTIVE });
        // Awaiting the issuer's own decision.
        if (qual.status !== QualificationStatus.APPROVED) {
          qual.status = QualificationStatus.UNDER_REVIEW;
        }
        qual.reviewedBy = reviewerId;
        qual.reviewedAt = new Date();
        qual.reviewNotes = dto.review_notes ?? null;
        const adminSaved = await this.qualRepo.save(qual);
        this.logger.log(`Admin approved KYC for investor ${qual.investorId}; qualification ${id} awaits issuer review`);
        return { qualification: adminSaved, identityAddress: null };
      }
    }

    qual.status = dto.status;
    qual.reviewedBy = reviewerId;
    qual.reviewedAt = new Date();
    qual.reviewNotes = dto.review_notes ?? null;
    qual.rejectedReason = dto.rejected_reason ?? null;
    qual.additionalClaimsRequired = dto.additional_claims_required ?? [];

    if (dto.status === QualificationStatus.APPROVED) {
      qual.approvedAt = new Date();
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      qual.expiresAt = expiresAt;
    }

    const saved = await this.qualRepo.save(qual);
    this.logger.log(`Qualification ${id} → ${dto.status} by ${reviewerRole} ${reviewerId}`);

    // An admin rejection rejects the investor everywhere: no issuer should review them.
    if (isAdmin && dto.status === QualificationStatus.REJECTED) {
      await this.qualRepo
        .createQueryBuilder()
        .update(IssuerInvestorQualification)
        .set({
          status: QualificationStatus.REJECTED,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          rejectedReason: dto.rejected_reason ?? null,
          reviewNotes: dto.review_notes ?? null,
        })
        .where('investor_id = :investorId AND status IN (:...open)', {
          investorId: qual.investorId,
          open: [QualificationStatus.PENDING, QualificationStatus.UNDER_REVIEW],
        })
        .execute();
    }

    let identityAddress: string | null = null;
    if (dto.status === QualificationStatus.APPROVED) {
      identityAddress = await this.enqueueBlockchainPipeline(saved);
    }

    return { qualification: saved, identityAddress };
  }

  async getStats(issuerId: string): Promise<Record<string, number>> {
    const rows = await this.qualRepo
      .createQueryBuilder('q')
      .select('q.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('q.issuerId = :issuerId', { issuerId })
      .groupBy('q.status')
      .getRawMany<{ status: string; count: string }>();

    const stats: Record<string, number> = {
      total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0, expired: 0,
    };
    for (const row of rows) {
      const n = parseInt(row.count, 10);
      stats.total += n;
      if (row.status in stats) stats[row.status] = n;
    }
    return stats;
  }

  // Called after a new token is deployed — registers all existing approved investors
  async whitelistForNewToken(
    issuerId: string,
    tokenId: string,
    identityRegistryAddress: string,
    countryOverride?: Record<string, number>,
  ): Promise<void> {
    const approved = await this.qualRepo.find({
      where: { issuerId, status: QualificationStatus.APPROVED },
      relations: ['profile'],
    });

    if (!approved.length) return;

    this.logger.log(`Whitelisting ${approved.length} existing investors for new token ${tokenId}`);

    for (const qual of approved) {
      const user = await this.userRepo.findOne({ where: { id: qual.investorId } });
      const walletAddress = user?.walletAddress ?? '';
      if (!walletAddress) continue;

      const profile = qual.profile;
      const countryCode = countryOverride?.[qual.investorId]
        ?? COUNTRY_CODES[profile?.country?.toUpperCase() ?? '']
        ?? 0;

      try {
        const irResult = await this.identityRegistry.registerInToken(
          qual.investorId,
          walletAddress,
          tokenId,
          identityRegistryAddress,
          countryCode,
        );
        if (!irResult.isWhitelisted) {
          this.logger.error(
            `IR.isVerified(${walletAddress}) = FALSE after registerIdentity() for investor ${qual.investorId} on token ${tokenId}`,
          );
        }
      } catch (err: unknown) {
        this.logger.warn(`IR registration skipped for investor ${qual.investorId} on token ${tokenId}: ${(err as Error).message}`);
      }

      if (profile) {
        try {
          await this.whitelist.addToWhitelist({
            token_id: tokenId,
            user_id: qual.investorId,
            wallet_address: walletAddress,
            country: profile.country,
            investor_type: toWhitelistType(profile.investorType),
          });
        } catch (err: unknown) {
          this.logger.debug(`Whitelist skipped for investor ${qual.investorId} on token ${tokenId}: ${(err as Error).message}`);
        }
      }
    }

    this.logger.log(`Retroactive whitelist complete for token ${tokenId}`);
  }

  // Returns active claims for an investor (DB mirror, not on-chain)
  async getInvestorClaims(investorId: string): Promise<InvestorClaim[]> {
    return this.claimRepo.find({
      where: { investorId, status: ClaimStatus.ACTIVE },
      order: { issuedAt: 'DESC' },
    });
  }

  /**
   * Trigger the identity pipeline for any approved qualifications where the investor
   * previously had no wallet linked. Called automatically when an investor links/updates
   * their wallet address after already being approved.
   */
  async triggerDeferredForInvestor(investorId: string): Promise<void> {
    const existingIdentity = await this.identityDeployment.getIdentityByUser(investorId);

    const approvedQuals = await this.qualRepo.find({
      where: { investorId, status: QualificationStatus.APPROVED },
    });

    if (!approvedQuals.length) return;

    this.logger.log(
      `Triggering deferred blockchain pipeline for investor ${investorId} (${approvedQuals.length} approved qualification(s))`,
    );

    // Re-enqueue all deferred qualifications — idempotency is handled inside the processor
    for (const qual of approvedQuals) {
      // A 'completed' run is only trusted while the wallet is still verified on
      // every issuer token — a wallet change or a token created later leaves it
      // unverified, so those must run again.
      if (qual.blockchainStatus === 'completed' && (await this.isFullyWhitelisted(qual))) continue;
      await this.enqueueBlockchainPipeline(qual);
    }
  }

  /** True when the investor's current wallet is IR-verified on every token of the issuer. */
  private async isFullyWhitelisted(qual: IssuerInvestorQualification): Promise<boolean> {
    try {
      const user = await this.userRepo.findOne({ where: { id: qual.investorId } });
      if (!user?.walletAddress) return false;
      const tokens = await this.tokenRepo.find({ where: { createdBy: qual.issuerId } });
      for (const t of tokens) {
        if (!t.identityRegistryAddress) continue;
        if (!(await this.identityRegistry.verifyWhitelist(user.walletAddress, t.identityRegistryAddress))) {
          return false;
        }
      }
      return true;
    } catch (err: unknown) {
      this.logger.warn(`Whitelist re-check failed for qualification ${qual.id}: ${(err as Error).message}`);
      return false;
    }
  }

  async retryBlockchainPipeline(
    id: string,
    reviewerId: string,
    reviewerRole: UserRole,
  ): Promise<string | null> {
    const qual = await this.getQualification(id);

    const isAdminOrAgent = [UserRole.COMPLIANCE_OFFICER, UserRole.TRANSFER_AGENT, UserRole.ADMIN].includes(reviewerRole as UserRole);
    if (!isAdminOrAgent && qual.issuerId !== reviewerId) {
      throw new BadRequestException('You are not the issuer for this qualification.');
    }

    if (qual.status !== QualificationStatus.APPROVED) {
      throw new BadRequestException('Only approved qualifications can have their pipeline retried.');
    }

    if (qual.blockchainStatus === 'completed') {
      throw new BadRequestException('Blockchain pipeline already completed successfully.');
    }

    this.logger.log(`Retrying blockchain pipeline for qualification ${id} (current status: ${qual.blockchainStatus})`);
    return this.enqueueBlockchainPipeline(qual);
  }

  /** Enqueue the blockchain pipeline job and update DB tracking fields. */
  private async enqueueBlockchainPipeline(qual: IssuerInvestorQualification): Promise<string | null> {
    const jobData: QualificationJobData = {
      qualificationId: qual.id,
      investorId: qual.investorId,
      issuerId: qual.issuerId,
      profileId: qual.profileId,
    };

    const job = await this.qualificationQueue.add(QUALIFICATION_JOB_NAME, jobData, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 }, // 10s, 20s, 40s, 80s, 160s
      removeOnComplete: { age: 7 * 24 * 3600 }, // keep completed jobs for 7 days
      removeOnFail: false, // keep failed jobs for debugging
    });

    await this.qualRepo.update(qual.id, {
      blockchainJobId: String(job.id),
      blockchainStatus: 'queued',
      blockchainError: null,
    });

    this.logger.log(
      `Blockchain pipeline enqueued: job=${job.id}  qualification=${qual.id}  investor=${qual.investorId}`,
    );

    // Return existing identity address if already deployed (for immediate API response)
    const existing = await this.identityDeployment.getIdentityByUser(qual.investorId);
    return existing?.identityContractAddress ?? null;
  }

  /** @deprecated Use enqueueBlockchainPipeline instead. Kept for whitelistForNewToken(). */
  private async triggerIdentityAndWhitelist(qual: IssuerInvestorQualification): Promise<string | null> {
    const profile =
      qual.profile ??
      (await this.profileRepo.findOne({ where: { id: qual.profileId } }));
    if (!profile) return null;

    const user = await this.userRepo.findOne({ where: { id: qual.investorId } });
    const walletAddress = user?.walletAddress ?? '';
    if (!walletAddress) {
      this.logger.log(`No wallet for investor ${qual.investorId} — identity deployment deferred`);
      return null;
    }

    // ── Step 1: Deploy ONCHAINID once (idempotent) ──────────────────────────
    const identity = await this.identityDeployment.getOrDeployIdentity(
      qual.investorId,
      walletAddress,
    );

    const countryCode = COUNTRY_CODES[profile.country?.toUpperCase()] ?? 0;

    // ── Step 2: Issue claims only if not already issued (reuse for 2nd issuer) ──
    const alreadyIssued = Object.keys(identity.claimTopicsIssued ?? {}).length > 0;
    let issuedClaims: IssueClaimResult[] = [];

    if (!alreadyIssued) {
      issuedClaims = await this.claimIssuance.issueKycClaims(qual.investorId, walletAddress, {
        countryCode,
        isAccredited: profile.accreditation !== AccreditationStatus.NONE,
      });
      this.logger.log(`Issued ${issuedClaims.length} claims for investor ${qual.investorId}`);
    } else {
      // Reconstruct from existing claimTopicsIssued so we can still populate claimsVerified
      issuedClaims = Object.entries(identity.claimTopicsIssued).map(([topic, txHash]) => ({
        topic: parseInt(topic, 10),
        topicName: CLAIM_TOPIC_NAMES[parseInt(topic, 10)] ?? `TOPIC_${topic}`,
        txHash: txHash as string,
        claimId: '',
        verified: true,
        signatureValid: true,
        issuerTrusted: true,
      }));
      this.logger.log(`Reusing existing ${issuedClaims.length} claims for investor ${qual.investorId}`);
    }

    // ── Step 3: Update user's identity contract address ──────────────────────
    await this.userRepo.update(qual.investorId, {
      identityContractAddress: identity.identityContractAddress,
    });

    // ── Step 4: Persist claims to DB mirror (investor_claims) ────────────────
    // Use the actual platform claim issuer address (not the identity contract itself)
    const claimIssuerAddress =
      this.configService.get<string>('CLAIM_ISSUER_ADDRESS') ??
      identity.identityContractAddress;
    const chainId = identity.chainId;

    for (const { topic, txHash } of issuedClaims) {
      try {
        await this.claimRepo.upsert(
          {
            investorId: qual.investorId,
            identityContract: identity.identityContractAddress,
            claimTopic: topic,
            claimTopicName: CLAIM_TOPIC_NAMES[topic] ?? `TOPIC_${topic}`,
            issuerAddress: claimIssuerAddress,
            txHash,
            chainId,
            status: ClaimStatus.ACTIVE,
            issuedAt: new Date(),
          },
          { conflictPaths: ['investorId', 'claimTopic'], skipUpdateIfNoValuesChanged: true },
        );
      } catch (err: unknown) {
        this.logger.warn(`Claim DB mirror failed for topic ${topic}: ${(err as Error).message}`);
      }
    }

    // ── Step 5: Update claimsVerified on this qualification ──────────────────
    // This fixes the bug where claimsVerified was always {}
    const claimsVerified: Record<string, string> = {};
    for (const { topic, txHash } of issuedClaims) {
      claimsVerified[String(topic)] = txHash;
    }
    await this.qualRepo.update(qual.id, { claimsVerified });
    this.logger.log(`Updated claimsVerified on qualification ${qual.id}: topics=${Object.keys(claimsVerified).join(',')}`);

    // ── Step 6: Register in ALL of this issuer's tokens ──────────────────────
    const issuerTokens = await this.tokenRepo.find({ where: { createdBy: qual.issuerId } });

    for (const token of issuerTokens) {
      if (token.identityRegistryAddress) {
        try {
          const irResult = await this.identityRegistry.registerInToken(
            qual.investorId,
            walletAddress,
            token.id,
            token.identityRegistryAddress,
            countryCode,
          );
          // IR.isVerified(wallet) is already called inside registerInToken — log the outcome here too
          this.logger.log(
            `IR registration for token ${token.id}: tx=${irResult.txHash || '(already registered)'}  isWhitelisted=${irResult.isWhitelisted}`,
          );
          // Final authoritative whitelist verification
          if (!irResult.isWhitelisted) {
            this.logger.error(
              `IR.isVerified(${walletAddress}) returned FALSE after registerIdentity() for token ${token.id} — investor is NOT whitelisted on-chain`,
            );
          }
        } catch (err: unknown) {
          this.logger.warn(`IR registration skipped for token ${token.id}: ${(err as Error).message}`);
        }
      }

      try {
        await this.whitelist.addToWhitelist({
          token_id: token.id,
          user_id: qual.investorId,
          wallet_address: walletAddress,
          country: profile.country,
          investor_type: toWhitelistType(profile.investorType),
        });
      } catch (err: unknown) {
        this.logger.debug(`Whitelist skipped for token ${token.id}: ${(err as Error).message}`);
      }
    }

    this.logger.log(
      `Identity pipeline complete: investor=${qual.investorId}, identity=${identity.identityContractAddress}, tokens=${issuerTokens.length}`,
    );
    return identity.identityContractAddress;
  }

  /**
   * Register every already-approved investor of this issuer into a token's
   * IdentityRegistry.
   *
   * Qualification is per *issuer*, but in ERC-3643 the whitelist is per *token*
   * — each deployment gets its own IdentityRegistry. The approval pipeline only
   * registers an investor into the tokens that exist at that moment, so a token
   * deployed later starts empty and previously-approved investors hit
   * `isVerified() == false` ("Identity Activation Pending") and cannot buy.
   *
   * This is the inverse direction: new token → existing investors. It is
   * idempotent (registerInToken no-ops when already verified) and safe to call
   * repeatedly, so it doubles as a repair for tokens already in that state.
   */
  async backfillTokenRegistrations(tokenId: string): Promise<{
    tokenId: string;
    registered: number;
    alreadyRegistered: number;
    failed: number;
    skipped: number;
  }> {
    const summary = { tokenId, registered: 0, alreadyRegistered: 0, failed: 0, skipped: 0 };

    const token = await this.tokenRepo.findOne({ where: { id: tokenId } });
    if (!token) throw new NotFoundException(`Token ${tokenId} not found`);
    if (!token.identityRegistryAddress) {
      this.logger.warn(`[Backfill] Token ${tokenId} has no IdentityRegistry yet — nothing to do`);
      return summary;
    }

    const quals = await this.qualRepo.find({
      where: { issuerId: token.createdBy, status: QualificationStatus.APPROVED },
    });

    this.logger.log(
      `[Backfill] token=${tokenId} (${token.symbol})  ir=${token.identityRegistryAddress}  ` +
        `approved investors=${quals.length}`,
    );

    for (const qual of quals) {
      const user = await this.userRepo.findOne({ where: { id: qual.investorId } });
      const walletAddress = user?.walletAddress;
      if (!walletAddress) {
        summary.skipped += 1;
        this.logger.debug(`[Backfill] investor ${qual.investorId} has no wallet — skipped`);
        continue;
      }

      const profile = await this.profileRepo.findOne({ where: { id: qual.profileId } });
      const countryCode = COUNTRY_CODES[(profile?.country ?? '').toUpperCase()] ?? 0;

      try {
        const result = await this.identityRegistry.registerInToken(
          qual.investorId,
          walletAddress,
          token.id,
          token.identityRegistryAddress,
          countryCode,
        );
        if (result.alreadyRegistered) summary.alreadyRegistered += 1;
        else summary.registered += 1;

        this.logger.log(
          `[Backfill] investor=${qual.investorId} wallet=${walletAddress} ` +
            `tx=${result.txHash || '(already registered)'} isWhitelisted=${result.isWhitelisted}`,
        );

        // Mirror the chain into the DB whitelist row. `addToWhitelist` alone
        // leaves an existing row stale (is_active=false), so read IR.isVerified()
        // back and let the chain be authoritative — same as the approval
        // pipeline's sync step.
        try {
          await this.blockchainSync.syncWhitelistEntry(
            walletAddress,
            token.id,
            token.identityRegistryAddress,
            {
              userId: qual.investorId,
              txHash: result.txHash || undefined,
              countryCode,
              country: profile?.country,
            },
          );
        } catch (err: unknown) {
          this.logger.warn(
            `[Backfill] whitelist sync failed for investor ${qual.investorId} on token ${tokenId}: ${(err as Error).message}`,
          );
        }
      } catch (err: unknown) {
        summary.failed += 1;
        this.logger.warn(
          `[Backfill] investor ${qual.investorId} failed for token ${tokenId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `[Backfill] token=${tokenId} done  registered=${summary.registered} ` +
        `already=${summary.alreadyRegistered} failed=${summary.failed} skipped=${summary.skipped}`,
    );
    return summary;
  }
}
