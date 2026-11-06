import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycSubmission, KycStatus, InvestorType, AccreditationStatus } from '../entities/kyc-submission.entity';
import { SubmitKycDto } from '../dto/submit-kyc.dto';
import { ReviewKycDto } from '../dto/review-kyc.dto';
import { AuditLogService } from '../../admin/services/audit-log.service';
import { IdentityDeploymentService } from '../../identity/services/identity-deployment.service';
import { ClaimIssuanceService } from '../../identity/services/claim-issuance.service';
import { IdentityRegistryService } from '../../identity/services/identity-registry.service';
import { WhitelistService } from '../../compliance/services/whitelist.service';
import { InvestorType as WhitelistInvestorType } from '../../compliance/entities/whitelist.entity';
import { User } from '../../auth/entities/user.entity';
import { Token } from '../../tokens/entities/token.entity';

const COUNTRY_CODES: Record<string, number> = {
  IN: 356, US: 840, GB: 826, DE: 276, FR: 250, SG: 702, AE: 784,
  JP: 392, CN: 156, AU: 36, CA: 124, BR: 76, ZA: 710, NG: 566,
};

export interface ReviewSubmissionResult {
  submission: KycSubmission;
  identityAddress: string | null;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectRepository(KycSubmission)
    private readonly kycRepository: Repository<KycSubmission>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    private readonly auditLog: AuditLogService,
    private readonly identityDeployment: IdentityDeploymentService,
    private readonly claimIssuance: ClaimIssuanceService,
    private readonly identityRegistry: IdentityRegistryService,
    private readonly whitelistService: WhitelistService,
  ) {}

  async submitKyc(userId: string, dto: SubmitKycDto): Promise<KycSubmission> {
    // Look up the token to get the issuer
    const token = await this.tokenRepository.findOne({ where: { id: dto.token_id } });
    if (!token) {
      throw new BadRequestException(`Token ${dto.token_id} not found`);
    }
    const issuerId = token.createdBy;

    // One active submission per (investor, issuer)
    const existing = await this.kycRepository.findOne({
      where: { userId, issuerId },
      order: { createdAt: 'DESC' },
    });

    if (existing && [KycStatus.PENDING, KycStatus.UNDER_REVIEW].includes(existing.status)) {
      throw new ConflictException(
        'You already have a pending KYC submission for this issuer. Please wait for review.',
      );
    }

    const submission = this.kycRepository.create({
      userId,
      issuerId,
      tokenId: dto.token_id,
      fullName: dto.full_name,
      dateOfBirth: dto.date_of_birth,
      nationality: dto.nationality,
      country: dto.country,
      addressLine1: dto.address_line1,
      addressLine2: dto.address_line2 || null,
      city: dto.city,
      postalCode: dto.postal_code,
      investorType: dto.investor_type ?? InvestorType.INDIVIDUAL,
      accreditation: dto.accreditation ?? AccreditationStatus.NONE,
      status: KycStatus.PENDING,
      submittedAt: new Date(),
    });

    const saved = await this.kycRepository.save(submission);
    this.logger.log(`KYC submission created: ${saved.id} for user ${userId} → issuer ${issuerId}`);
    this.auditLog.create({
      tenant_id: 'system',
      actor_id: userId,
      actor_role: 'investor',
      action: 'kyc.submit',
      resource_type: 'kyc',
      resource_id: saved.id,
      details: { issuer_id: issuerId, token_id: dto.token_id, full_name: dto.full_name },
    }).catch(() => {});
    return saved;
  }

  // Single latest submission (backward compat) — used by investor to check their status
  async getMySubmission(userId: string, tokenId?: string): Promise<KycSubmission> {
    const where: Record<string, string> = { userId };
    if (tokenId) where.tokenId = tokenId;

    const submission = await this.kycRepository.findOne({
      where,
      order: { createdAt: 'DESC' },
      relations: ['documents'],
    });

    if (!submission) {
      throw new NotFoundException('No KYC submission found');
    }
    return submission;
  }

  // All submissions for an investor (one per issuer/token)
  async getMySubmissions(userId: string): Promise<KycSubmission[]> {
    return this.kycRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: ['documents'],
    });
  }

  // All submissions directed to a specific issuer
  async getAllSubmissions(
    issuerId: string,
    page = 1,
    limit = 20,
    status?: KycStatus,
  ): Promise<{ data: KycSubmission[]; total: number; page: number; limit: number }> {
    const qb = this.kycRepository
      .createQueryBuilder('kyc')
      .where('kyc.issuerId = :issuerId', { issuerId });

    if (status) {
      qb.andWhere('kyc.status = :status', { status });
    }

    const [data, total] = await qb
      .orderBy('kyc.submittedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async getSubmission(id: string): Promise<KycSubmission> {
    const submission = await this.kycRepository.findOne({
      where: { id },
      relations: ['documents'],
    });
    if (!submission) throw new NotFoundException(`KYC submission ${id} not found`);
    return submission;
  }

  async reviewSubmission(
    id: string,
    reviewerId: string,
    dto: ReviewKycDto,
  ): Promise<ReviewSubmissionResult> {
    const submission = await this.getSubmission(id);

    // Verify the reviewer is the correct issuer
    if (submission.issuerId && submission.issuerId !== reviewerId) {
      throw new BadRequestException('You are not the issuer for this KYC submission');
    }

    if ([KycStatus.APPROVED, KycStatus.REJECTED].includes(submission.status)) {
      throw new BadRequestException(
        `Submission has already been ${submission.status}. Cannot review again.`,
      );
    }

    submission.status = dto.status as unknown as KycStatus;
    submission.reviewedBy = reviewerId;
    submission.reviewNotes = dto.review_notes || null;
    submission.reviewedAt = new Date();

    if (dto.status === 'approved') {
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      submission.expiresAt = expiryDate;
    }

    const updated = await this.kycRepository.save(submission);
    this.logger.log(`KYC ${id} reviewed as ${dto.status} by issuer ${reviewerId}`);
    this.auditLog.create({
      tenant_id: 'system',
      actor_id: reviewerId,
      actor_role: 'issuer',
      action: `kyc.${dto.status}`,
      resource_type: 'kyc',
      resource_id: id,
      details: { userId: submission.userId, tokenId: submission.tokenId },
    }).catch(() => {});

    let identityAddress: string | null = null;
    if (dto.status === 'approved') {
      try {
        identityAddress = await this.triggerIdentityFlow(updated);
      } catch (err: unknown) {
        this.logger.error(
          `Identity flow failed for user ${updated.userId}: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }

    return { submission: updated, identityAddress };
  }

  private async triggerIdentityFlow(submission: KycSubmission): Promise<string | null> {
    this.logger.log(`Triggering identity flow for user ${submission.userId}`);
    const user = await this.userRepository.findOne({ where: { id: submission.userId } });
    const walletAddress = user?.walletAddress ?? '';

    if (!walletAddress) {
      this.logger.log(`No wallet for user ${submission.userId} — identity deployment deferred`);
      return null;
    }

    const identity = await this.identityDeployment.getOrDeployIdentity(
      submission.userId,
      walletAddress,
    );

    const countryCode = COUNTRY_CODES[submission.country?.toUpperCase()] ?? 0;

    await this.claimIssuance.issueKycClaims(submission.userId, walletAddress, {
      countryCode,
      isAccredited: submission.accreditation !== AccreditationStatus.NONE,
    });

    await this.userRepository.update(submission.userId, {
      identityContractAddress: identity.identityContractAddress,
    });

    // Register investor in the token's on-chain IdentityRegistry and DB whitelist
    if (submission.tokenId) {
      const token = await this.tokenRepository.findOne({ where: { id: submission.tokenId } });
      if (token?.identityRegistryAddress) {
        try {
          await this.identityRegistry.registerInToken(
            submission.userId,
            walletAddress,
            submission.tokenId,
            token.identityRegistryAddress,
            countryCode,
          );
          this.logger.log(`Registered ${walletAddress} in IR for token ${submission.tokenId}`);
        } catch (err: unknown) {
          this.logger.error(
            `IR registration failed for user ${submission.userId}: ${(err as Error).message}`,
          );
        }
      }

      const whitelistInvestorType =
        submission.investorType === InvestorType.INSTITUTIONAL
          ? WhitelistInvestorType.INSTITUTIONAL
          : submission.investorType === InvestorType.ACCREDITED
            ? WhitelistInvestorType.ACCREDITED
            : WhitelistInvestorType.RETAIL;

      try {
        await this.whitelistService.addToWhitelist({
          token_id: submission.tokenId,
          user_id: submission.userId,
          wallet_address: walletAddress,
          country: submission.country,
          investor_type: whitelistInvestorType,
        });
        this.logger.log(`Whitelisted ${walletAddress} for token ${submission.tokenId}`);
      } catch (err: unknown) {
        // ConflictException means already whitelisted — not an error
        this.logger.warn(`Whitelist insert skipped for ${walletAddress}: ${(err as Error).message}`);
      }
    }

    return identity.identityContractAddress;
  }

  async getStats(issuerId: string): Promise<{
    total: number;
    pending: number;
    under_review: number;
    approved: number;
    rejected: number;
    expired: number;
  }> {
    const counts = await this.kycRepository
      .createQueryBuilder('kyc')
      .select('kyc.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('kyc.issuerId = :issuerId', { issuerId })
      .groupBy('kyc.status')
      .getRawMany();

    const stats = { total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0, expired: 0 };
    for (const row of counts) {
      const count = parseInt(row.count, 10);
      stats.total += count;
      if (row.status in stats) (stats as Record<string, number>)[row.status] = count;
    }
    return stats;
  }
}
