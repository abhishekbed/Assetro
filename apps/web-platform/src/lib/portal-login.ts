import { portalForRole, type AppRole, type User } from '@/store/auth.store';

const LABEL: Record<AppRole, string> = {
  investor: 'investor',
  issuer: 'issuer',
};

/**
 * Check that credentials accepted by the API actually belong to the portal
 * the user signed in through.
 *
 * The API authenticates a person, not a portal — without this an issuer could
 * sign in at the investor door (and land in the wrong dashboard, or be bounced
 * straight back out by the route guard). Returns null when the login is
 * allowed, or the message to show when it is not.
 */
export function rejectWrongPortal(user: Pick<User, 'role'>, portal: AppRole): string | null {
  const held = portalForRole(user.role);

  if (held === portal) return null;

  if (held) {
    const other = held === 'issuer' ? 'Issuer' : 'Investor';
    return `This is an ${LABEL[portal]} account page. Your account is registered as an ${LABEL[held]} — please use the ${other} sign-in.`;
  }

  // admin / compliance_officer / transfer_agent are served by other apps.
  return `This account does not have access to the ${LABEL[portal]} portal.`;
}
