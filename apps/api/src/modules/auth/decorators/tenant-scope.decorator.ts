import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../entities/user.entity';
import { JwtPayload } from '../services/jwt.service';

/**
 * Resolves the tenant a request is allowed to act within.
 *
 * The `x-tenant-id` header is supplied by the client, so trusting it lets any
 * authenticated issuer reach another tenant's data simply by changing or
 * omitting it. This decorator takes the tenant from the signed JWT instead.
 *
 *  - issuer (and any other tenant-bound role): pinned to the tenant on their
 *    token, header ignored.
 *  - admin: may act across tenants, so an explicit header is honoured and no
 *    header means "every tenant" — which is what the admin console expects.
 *  - investor / unauthenticated-tenant users: unchanged (undefined), because
 *    their reads are scoped by user id rather than by tenant.
 */
export const TenantScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    if (user?.role === UserRole.ADMIN) {
      const header = request.headers?.['x-tenant-id'];
      return typeof header === 'string' && header.length > 0 ? header : undefined;
    }

    return user?.tenantId ?? undefined;
  },
);
