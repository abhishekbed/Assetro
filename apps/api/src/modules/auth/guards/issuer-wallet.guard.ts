import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../entities/user.entity';
import { JwtPayload } from '../services/jwt.service';

export const WALLET_HEADER = 'x-wallet-address';

/**
 * Blocks issuer-initiated on-chain actions unless the wallet the issuer has
 * connected (sent as `X-Wallet-Address`) is the one registered on their account.
 * Admins are not issuer-bound and pass through.
 */
@Injectable()
export class IssuerWalletGuard implements CanActivate {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const jwtUser = request.user as JwtPayload | undefined;
    if (!jwtUser || jwtUser.role !== UserRole.ISSUER) return true;

    const user = await this.users.findOne({
      where: { id: jwtUser.sub },
      select: ['id', 'issuerWalletAddress'],
    });
    const registered = user?.issuerWalletAddress?.toLowerCase();
    if (!registered) {
      throw new ForbiddenException(
        'No issuer wallet is registered. Register your MetaMask wallet in Settings before sending transactions.',
      );
    }

    const raw = request.headers?.[WALLET_HEADER];
    const connected = (Array.isArray(raw) ? raw[0] : raw)?.toString().toLowerCase();
    if (!connected) {
      throw new ForbiddenException('Connect your registered issuer wallet to continue.');
    }
    if (connected !== registered) {
      throw new ForbiddenException(
        `Connected wallet ${connected} does not match your registered issuer wallet ${registered}. ` +
          'Switch account in MetaMask, or change your registered wallet in Settings.',
      );
    }
    return true;
  }
}
