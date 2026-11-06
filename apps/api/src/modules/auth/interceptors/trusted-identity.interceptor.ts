import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { UserRole } from '../entities/user.entity';
import { JwtPayload } from '../services/jwt.service';

/** Tenant id that matches nothing — used for issuers that have no tenant yet. */
export const NO_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Controllers read the caller's identity from the `x-user-id` / `x-tenant-id`
 * request headers, but those are set by the client, so any signed-in user could
 * act as another user or tenant by changing them. After authentication has run
 * (guards execute before interceptors), this replaces them with the values from
 * the signed JWT so every `@Headers(...)` read downstream is trustworthy.
 *
 *  - `x-user-id`: always the token's user for any authenticated request.
 *  - `x-tenant-id`: pinned to the token's tenant for issuers (an issuer that is
 *    not approved yet gets a tenant that matches nothing). Admins and investors
 *    keep whatever header they sent, as before.
 */
@Injectable()
export class TrustedIdentityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    if (user?.sub && request.headers) {
      request.headers['x-user-id'] = user.sub;
      if (user.role === UserRole.ISSUER) {
        request.headers['x-tenant-id'] = user.tenantId || NO_TENANT_ID;
      }
    }

    return next.handle();
  }
}

/**
 * Tenant a request must stay inside for ownership checks: issuers are pinned to
 * their own tenant; admins, agents and investors are not restricted here.
 */
export function ownerTenantFor(user?: JwtPayload | null): string | undefined {
  if (user?.role === UserRole.ISSUER) return user.tenantId || NO_TENANT_ID;
  return undefined;
}
