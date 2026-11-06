import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { InvestorProfile, AdminKycStatus } from '../entities/investor-profile.entity';
import { KycDocument, DocumentType } from '../entities/kyc-document.entity';
import { InvestorWallet, WalletType } from '../entities/investor-wallet.entity';
import { SubmitProfileDto } from '../dto/submit-profile.dto';
import { InvestorType, AccreditationStatus } from '../entities/kyc-submission.entity';
import { IssuerInvestorQualification, QualificationStatus } from '../entities/issuer-investor-qualification.entity';
import { User, UserRole } from '../../auth/entities/user.entity';
import { Token } from '../../tokens/entities/token.entity';
import { S3UploadService } from './s3-upload.service';
import { IssuerQualificationService } from './issuer-qualification.service';

@Injectable()
export class InvestorProfileService {
  private readonly logger = new Logger(InvestorProfileService.name);

  constructor(
    @InjectRepository(InvestorProfile)
    private readonly profileRepo: Repository<InvestorProfile>,
    @InjectRepository(KycDocument)
    private readonly documentRepo: Repository<KycDocument>,
    @InjectRepository(InvestorWallet)
    private readonly walletRepo: Repository<InvestorWallet>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
    @InjectRepository(IssuerInvestorQualification)
    private readonly qualRepo: Repository<IssuerInvestorQualification>,
    private readonly s3Upload: S3UploadService,
    @Inject(forwardRef(() => IssuerQualificationService))
    private readonly qualificationService: IssuerQualificationService,
  ) {}

  async getProfile(userId: string): Promise<InvestorProfile | null> {
    return this.profileRepo.findOne({
      where: { userId },
      relations: ['documents'],
    });
  }

  async submitProfile(userId: string, dto: SubmitProfileDto): Promise<InvestorProfile> {
    const existing = await this.profileRepo.findOne({ where: { userId } });

    const extraData = {
      ...(existing?.extraData || {}),
      ...(dto.phone ? { phone: dto.phone } : {}),
      ...(dto.tax_id ? { tax_id: dto.tax_id } : {}),
      ...(dto.company_name ? { company_name: dto.company_name } : {}),
      ...(dto.company_registration ? { company_registration: dto.company_registration } : {}),
      ...(dto.company_country ? { company_country: dto.company_country } : {}),
    };

    if (existing) {
      existing.fullName = dto.full_name;
      existing.dateOfBirth = dto.date_of_birth;
      existing.nationality = dto.nationality;
      existing.country = dto.country;
      existing.addressLine1 = dto.address_line1;
      existing.addressLine2 = dto.address_line2 ?? null;
      existing.city = dto.city;
      existing.postalCode = dto.postal_code;
      existing.investorType = dto.investor_type ?? existing.investorType;
      existing.accreditation = dto.accreditation ?? existing.accreditation;
      existing.extraData = Object.keys(extraData).length > 0 ? extraData : existing.extraData;
      existing.submittedAt = new Date();
      if (existing.adminKycStatus === AdminKycStatus.REJECTED) {
        existing.adminKycStatus = AdminKycStatus.PENDING;
        existing.adminReason = null;
        await this.qualRepo.update(
          { investorId: userId, status: QualificationStatus.REJECTED },
          { status: QualificationStatus.PENDING, rejectedReason: null, reviewNotes: null }
        );
      }
      const updated = await this.profileRepo.save(existing);
      if (dto.full_name) {
        await this.userRepo.update(userId, {
          name: dto.full_name,
          ...(dto.phone ? { phone: dto.phone } : {}),
        });
      }
      this.logger.log(`Updated investor profile for user ${userId}`);
      return updated;
    }

    const profile = this.profileRepo.create({
      userId,
      fullName: dto.full_name,
      dateOfBirth: dto.date_of_birth,
      nationality: dto.nationality,
      country: dto.country,
      addressLine1: dto.address_line1,
      addressLine2: dto.address_line2 ?? null,
      city: dto.city,
      postalCode: dto.postal_code,
      investorType: dto.investor_type ?? InvestorType.INDIVIDUAL,
      accreditation: dto.accreditation ?? AccreditationStatus.NONE,
      extraData: Object.keys(extraData).length > 0 ? extraData : null,
      submittedAt: new Date(),
    });

    const saved = await this.profileRepo.save(profile);
    this.logger.log(`Created investor profile for user ${userId}`);

    // Ensure a qualification record exists so Admin can review and approve it
    try {
      const existingQuals = await this.qualificationService.getMyQualifications(userId);
      if (!existingQuals || existingQuals.length === 0) {
        const token = await this.tokenRepo.findOne({
          where: { status: 'active' as any },
          order: { createdAt: 'DESC' },
        }) ?? await this.tokenRepo.findOne({ order: { createdAt: 'DESC' } });
        let issuerId = token?.createdBy;
        if (!issuerId) {
          const issuerUser = await this.userRepo.findOne({ where: { role: UserRole.ISSUER } });
          issuerId = issuerUser?.id;
        }
        if (issuerId) {
          await this.qualificationService.requestQualification(userId, issuerId, { skipAdminCheck: true });
          this.logger.log(`Auto-created qualification request for user ${userId} -> issuer ${issuerId}`);
        }
      }
    } catch (err: unknown) {
      this.logger.warn(`Failed to auto-create qualification for user ${userId}: ${(err as Error).message}`);
    }

    return saved;
  }

  async uploadDocument(
    profileId: string,
    documentType: DocumentType,
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<KycDocument> {
    const profile = await this.profileRepo.findOne({ where: { id: profileId } });
    if (!profile) throw new NotFoundException(`Profile ${profileId} not found`);

    const { url } = await this.s3Upload.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      tenantId,
      profileId,
    );

    const doc = this.documentRepo.create({
      profileId,
      kycSubmissionId: null,
      documentType,
      fileName: file.originalname,
      fileUrl: url,
      fileSize: file.size,
      mimeType: file.mimetype,
    });

    return this.documentRepo.save(doc);
  }

  async getDocuments(profileId: string): Promise<KycDocument[]> {
    return this.documentRepo.find({ where: { profileId } });
  }

  async linkWallet(
    userId: string,
    walletAddress: string,
    walletType: WalletType = WalletType.EOA,
  ): Promise<{ walletAddress: string }> {
    if (!ethers.isAddress(walletAddress)) {
      throw new BadRequestException('Invalid Ethereum wallet address');
    }

    const checksummed = ethers.getAddress(walletAddress);

    // Check if another user already owns this wallet
    const existing = await this.userRepo.findOne({ where: { walletAddress: checksummed } });
    if (existing && existing.id !== userId) {
      throw new BadRequestException('This wallet address is already linked to another account');
    }

    // Save to user record (source of truth for pipeline lookup)
    await this.userRepo.update(userId, { walletAddress: checksummed });

    // Upsert to investor_wallets (multi-wallet mirror)
    await this.walletRepo.upsert(
      {
        investorId: userId,
        address: checksummed,
        type: walletType,
        isPrimary: true,
        isVerified: false,
      },
      { conflictPaths: ['investorId', 'address'], skipUpdateIfNoValuesChanged: true },
    );

    this.logger.log(`Investor ${userId} linked wallet ${checksummed}`);

    // Trigger any approved qualifications that were deferred because no wallet was linked
    this.qualificationService.triggerDeferredForInvestor(userId).catch((err: Error) =>
      this.logger.warn(`Deferred identity trigger failed after linkWallet: ${err.message}`),
    );

    return { walletAddress: checksummed };
  }

  async unlinkWallet(userId: string): Promise<void> {
    await this.userRepo.update(userId, { walletAddress: null as unknown as string });
    this.logger.log(`Investor ${userId} unlinked wallet`);
  }

  async getWallets(userId: string): Promise<InvestorWallet[]> {
    return this.walletRepo.find({ where: { investorId: userId }, order: { isPrimary: 'DESC' } });
  }
}
