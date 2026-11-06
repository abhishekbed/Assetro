import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Put,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ethers } from 'ethers';
import { User, UserRole } from '../entities/user.entity';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { JwtPayload } from '../services/jwt.service';

const MESSAGE_MAX_AGE_MS = 10 * 60 * 1000;

/** The exact text the issuer signs in MetaMask. Kept in one place so frontend and backend agree. */
export function issuerWalletMessage(userId: string, wallet: string, issuedAt: string): string {
  return (
    `Assetro: register issuer wallet\n` +
    `Account: ${userId}\n` +
    `Wallet: ${wallet.toLowerCase()}\n` +
    `Issued: ${issuedAt}`
  );
}

@Controller('issuer/wallet')
export class IssuerWalletController {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  @Roles(UserRole.ISSUER)
  @Get()
  async get(@CurrentUser() jwt: JwtPayload) {
    const user = await this.users.findOne({ where: { id: jwt.sub } });
    return {
      success: true,
      data: {
        wallet_address: user?.issuerWalletAddress ?? null,
        updated_at: user?.issuerWalletUpdatedAt ?? null,
      },
    };
  }

  /**
   * Register or change the issuer wallet. The caller must prove they control
   * the new address by signing the message from `issuerWalletMessage`.
   */
  @Roles(UserRole.ISSUER)
  @Put()
  async set(
    @CurrentUser() jwt: JwtPayload,
    @Body() body: { wallet_address?: string; issued_at?: string; signature?: string },
  ) {
    const { wallet_address, issued_at, signature } = body ?? {};
    if (!wallet_address || !ethers.isAddress(wallet_address)) {
      throw new BadRequestException('A valid wallet_address is required.');
    }
    if (!issued_at || !signature) {
      throw new BadRequestException('issued_at and signature are required.');
    }
    const issuedMs = Date.parse(issued_at);
    if (Number.isNaN(issuedMs) || Math.abs(Date.now() - issuedMs) > MESSAGE_MAX_AGE_MS) {
      throw new BadRequestException('The signed message has expired. Sign again.');
    }

    let recovered: string;
    try {
      recovered = ethers.verifyMessage(issuerWalletMessage(jwt.sub, wallet_address, issued_at), signature);
    } catch {
      throw new ForbiddenException('Invalid signature.');
    }
    if (recovered.toLowerCase() !== wallet_address.toLowerCase()) {
      throw new ForbiddenException('Signature does not match the wallet address.');
    }

    const normalized = wallet_address.toLowerCase();
    const taken = await this.users.findOne({
      where: { issuerWalletAddress: normalized, id: Not(jwt.sub) },
      select: ['id'],
    });
    if (taken) throw new ConflictException('This wallet is already registered to another issuer.');

    await this.users.update(jwt.sub, {
      issuerWalletAddress: normalized,
      issuerWalletUpdatedAt: new Date(),
    });
    return { success: true, data: { wallet_address: normalized } };
  }
}
