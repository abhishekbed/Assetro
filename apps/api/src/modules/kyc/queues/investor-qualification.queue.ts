export const INVESTOR_QUALIFICATION_QUEUE = 'investor-qualification-blockchain';

export const QUALIFICATION_JOB_NAME = 'run-pipeline';

export interface QualificationJobData {
  qualificationId: string;
  investorId: string;
  issuerId: string;
  profileId: string;
}

export enum QualificationPipelineStep {
  DEPLOY_ONCHAINID = 'deploy_onchainid',
  ISSUE_CLAIMS = 'issue_claims',
  REGISTER_IDENTITY = 'register_identity',
  VERIFY_WHITELIST = 'verify_whitelist',
  SYNC_DB = 'sync_db',
  NOTIFY = 'notify',
}

export function blockchainStepStatus(step: QualificationPipelineStep): string {
  return `step:${step}`;
}
