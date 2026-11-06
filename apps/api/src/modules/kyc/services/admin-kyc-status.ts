import { Repository } from 'typeorm';
import { AdminKycStatus, InvestorProfile } from '../entities/investor-profile.entity';
import {
  IssuerInvestorQualification,
  QualificationStatus,
} from '../entities/issuer-investor-qualification.entity';
import { KycSubmission, KycStatus } from '../entities/kyc-submission.entity';

/**
 * The platform-admin KYC level for an investor.
 *
 * Profiles reviewed after the admin/issuer split carry an explicit status.
 * Older profiles have none: they count as admin-approved only if they were
 * already approved under the single-level flow (any approved qualification or
 * an approved KYC submission), so nobody who was cleared before is locked out.
 */
export async function resolveAdminKycStatus(
  repos: {
    profileRepo: Repository<InvestorProfile>;
    qualRepo: Repository<IssuerInvestorQualification>;
    kycRepo?: Repository<KycSubmission>;
  },
  investorId: string,
): Promise<AdminKycStatus> {
  const profile = await repos.profileRepo.findOne({ where: { userId: investorId } });
  if (profile?.adminKycStatus) return profile.adminKycStatus;

  const legacyQual = await repos.qualRepo.findOne({
    where: { investorId, status: QualificationStatus.APPROVED },
    select: ['id'],
  });
  if (legacyQual) return AdminKycStatus.APPROVED;

  if (repos.kycRepo) {
    const legacySubmission = await repos.kycRepo.findOne({
      where: { userId: investorId, status: KycStatus.APPROVED },
      select: ['id'],
    });
    if (legacySubmission) return AdminKycStatus.APPROVED;
  }
  return AdminKycStatus.PENDING;
}
