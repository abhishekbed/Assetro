import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ethers } from 'ethers';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto, WalletLoginDto } from '../dto/login.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus, UserRole } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository';
import {
  IssuerLead,
  IssuerLeadStatus,
} from '../../issuer-leads/entities/issuer-lead.entity';
import { JwtTokenService, TokenPair, JwtPayload } from './jwt.service';
import { AuditLogService } from '../../admin/services/audit-log.service';
import { OtpService } from '../../notifications/services/otp.service';
import { EmailService } from '../../notifications/services/email.service';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '../../notifications/entities/email-otp.entity';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly tokenService: JwtTokenService,
    private readonly auditLog: AuditLogService,
    private readonly otpService: OtpService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    @InjectRepository(IssuerLead)
    private readonly leadRepo: Repository<IssuerLead>,
  ) {}

  // ─── Registration ──────────────────────────────────────────────

  /**
   * Create the account in PENDING_VERIFICATION and email a one-time code.
   *
   * No session is returned here — the caller must complete `verifyEmailOtp`
   * first, so an address nobody controls can never reach an active account.
   *
   * A re-register against an address that exists but was never verified
   * replaces the stale record rather than 409-ing, otherwise a user who closed
   * the tab before entering the code would be permanently locked out of their
   * own email address.
   */
  async register(dto: RegisterDto): Promise<{ email: string; otpSent: true }> {
    const email = dto.email.toLowerCase();
    const existing = await this.userRepository.findByEmail(email);

    if (existing && existing.isEmailVerified) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    let user: User;
    if (existing) {
      await this.userRepository.update(existing.id, {
        passwordHash,
        name: dto.name,
        role: dto.role,
        phone: dto.phone ?? null,
        status: UserStatus.PENDING_VERIFICATION,
      });
      user = { ...existing, name: dto.name, role: dto.role } as User;
      this.logger.log(`Re-registering unverified account: ${email}`);
    } else {
      user = await this.userRepository.create({
        email,
        passwordHash,
        name: dto.name,
        role: dto.role,
        phone: dto.phone ?? null,
        tenantId: null,
        status: UserStatus.PENDING_VERIFICATION,
        isEmailVerified: false,
      });
    }

    await this.otpService.issue(email, OtpPurpose.SIGNUP, dto.name);

    this.logger.log(`Registration started, OTP sent: ${email}`);
    this.auditLog.create({ tenant_id: 'system', actor_id: user.id, actor_role: user.role, action: 'user.register.otp_sent', resource_type: 'user', resource_id: user.id, details: { email, role: dto.role } }).catch(() => {});

    return { email, otpSent: true };
  }

  /**
   * Confirm the signup code, activate the account and return the first session.
   */
  async verifyEmailOtp(
    email: string,
    code: string,
  ): Promise<{ user: Partial<User>; tokens: TokenPair }> {
    const normalized = email.toLowerCase();
    const user = await this.userRepository.findByEmail(normalized);

    if (!user) {
      throw new BadRequestException('No pending registration found for this email');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('This email is already verified. Please log in.');
    }

    await this.otpService.verify(normalized, OtpPurpose.SIGNUP, code);

    await this.userRepository.update(user.id, {
      isEmailVerified: true,
      emailVerificationToken: null,
      status: UserStatus.ACTIVE,
    });

    const verified: User = {
      ...user,
      isEmailVerified: true,
      status: UserStatus.ACTIVE,
    };
    const tokens = await this.generateTokenPair(verified);

    this.logger.log(`Email verified via OTP, account active: ${normalized}`);
    this.auditLog.create({ tenant_id: user.tenantId ?? 'system', actor_id: user.id, actor_role: user.role, action: 'user.email_verified', resource_type: 'user', resource_id: user.id, details: { email: normalized } }).catch(() => {});

    return { user: this.sanitizeUser(verified), tokens };
  }

  /** Re-send the signup code. Rate limiting lives in OtpService. */
  async resendSignupOtp(email: string): Promise<{ email: string; otpSent: true }> {
    const normalized = email.toLowerCase();
    const user = await this.userRepository.findByEmail(normalized);

    if (!user) {
      throw new BadRequestException('No pending registration found for this email');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('This email is already verified. Please log in.');
    }

    await this.otpService.issue(normalized, OtpPurpose.SIGNUP, user.name);
    return { email: normalized, otpSent: true };
  }

  // ─── Email / Password Login ────────────────────────────────────

  async login(dto: LoginDto): Promise<{ user: Partial<User>; tokens: TokenPair }> {
    const user = await this.validateUserCredentials(dto.email, dto.password);

    if (user.is2faEnabled) {
      if (!dto.totpCode) {
        throw new BadRequestException('2FA code is required');
      }
      const valid = authenticator.verify({
        token: dto.totpCode,
        secret: user.totpSecret!,
      });
      if (!valid) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
    }

    await this.userRepository.update(user.id, { lastLoginAt: new Date() });

    const tokens = await this.generateTokenPair(user);

    this.logger.log(`User logged in: ${user.email}`);
    this.auditLog.create({ tenant_id: user.tenantId ?? 'system', actor_id: user.id, actor_role: user.role, action: 'user.login', resource_type: 'user', resource_id: user.id, details: { email: user.email } }).catch(() => {});

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async validateUserCredentials(email: string, password: string): Promise<User> {
    const user = await this.userRepository.findByEmail(email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('Account is suspended. Please contact support.');
    }

    // Verify the password before revealing that the address is unverified —
    // otherwise this doubles as an oracle for which emails have accounts.
    if (user.passwordHash && !user.isEmailVerified) {
      const passwordOk = await bcrypt.compare(password, user.passwordHash);
      if (passwordOk) {
        throw new ForbiddenException(
          'Please verify your email before logging in. Request a new code from the signup page.',
        );
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses wallet-based authentication. Please login with your wallet.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  // ─── Wallet Login (EIP-712) ────────────────────────────────────

  async createWalletChallenge(walletAddress: string): Promise<{ nonce: string; message: string }> {
    const normalizedAddress = walletAddress.toLowerCase();
    const nonce = crypto.randomBytes(16).toString('hex');
    const issuedAt = new Date().toISOString();

    const user = await this.userRepository.findByWalletAddress(normalizedAddress);
    if (user) {
      await this.userRepository.update(user.id, { walletNonce: nonce });
    }

    return {
      nonce,
      message: [
        'Sign in to Assetro',
        `Wallet: ${walletAddress}`,
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt}`,
      ].join('\n'),
    };
  }

  async walletLogin(dto: WalletLoginDto): Promise<{ user: Partial<User>; tokens: TokenPair }> {
    const recoveredAddress = this.verifyWalletSignature(dto);

    if (recoveredAddress.toLowerCase() !== dto.walletAddress.toLowerCase()) {
      throw new UnauthorizedException('Invalid wallet signature');
    }

    let user = await this.userRepository.findByWalletAddress(dto.walletAddress.toLowerCase());

    if (user) {
      if (user.walletNonce !== dto.nonce) {
        throw new UnauthorizedException('Invalid nonce. Please request a new login challenge.');
      }

      // Rotate nonce after successful verification
      await this.userRepository.update(user.id, {
        lastLoginAt: new Date(),
        walletNonce: crypto.randomBytes(16).toString('hex'),
      });
    } else {
      // Auto-create user for new wallet addresses
      user = await this.userRepository.create({
        email: `${dto.walletAddress.toLowerCase()}@wallet.assetro.io`,
        walletAddress: dto.walletAddress.toLowerCase(),
        name: `Wallet ${dto.walletAddress.slice(0, 8)}`,
        status: UserStatus.ACTIVE,
        isEmailVerified: false,
        walletNonce: crypto.randomBytes(16).toString('hex'),
      });
    }

    const tokens = await this.generateTokenPair(user);

    this.logger.log(`Wallet login: ${dto.walletAddress}`);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  private verifyWalletSignature(dto: WalletLoginDto): string {
    try {
      // Verify a personal_sign signature (EIP-191)
      const recoveredAddress = ethers.verifyMessage(dto.message, dto.signature);
      return recoveredAddress;
    } catch {
      throw new UnauthorizedException('Failed to verify wallet signature');
    }
  }

  // ─── Token Refresh ─────────────────────────────────────────────

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload & { type: string };

    try {
      payload = await this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('Account is suspended');
    }

    return this.generateTokenPair(user);
  }

  // ─── 2FA ───────────────────────────────────────────────────────

  async enable2FA(userId: string): Promise<{ secret: string; qrCodeUri: string }> {
    const user = await this.getUserOrThrow(userId);

    if (user.is2faEnabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, 'Assetro', secret);
    const qrCodeUri = await QRCode.toDataURL(otpauthUrl);

    // Store secret temporarily; it becomes active only after verify2FA
    await this.userRepository.update(user.id, { totpSecret: secret });

    return { secret, qrCodeUri };
  }

  async verify2FA(userId: string, totpCode: string): Promise<{ success: boolean }> {
    const user = await this.getUserOrThrow(userId);

    if (!user.totpSecret) {
      throw new BadRequestException('2FA has not been initialized. Call enable2FA first.');
    }

    const isValid = authenticator.verify({ token: totpCode, secret: user.totpSecret });

    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.userRepository.update(user.id, { is2faEnabled: true });

    return { success: true };
  }

  async disable2FA(userId: string, totpCode: string): Promise<{ success: boolean }> {
    const user = await this.getUserOrThrow(userId);

    if (!user.is2faEnabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    const isValid = authenticator.verify({ token: totpCode, secret: user.totpSecret! });

    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.userRepository.update(user.id, {
      is2faEnabled: false,
      totpSecret: null,
    });

    return { success: true };
  }

  // ─── Email Verification ────────────────────────────────────────

  async verifyEmail(token: string): Promise<{ success: boolean }> {
    const user = await this.userRepository.findByEmailVerificationToken(token);
    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.userRepository.update(user.id, {
      isEmailVerified: true,
      emailVerificationToken: null,
      status: UserStatus.ACTIVE,
    });

    this.logger.log(`Email verified: ${user.email}`);

    return { success: true };
  }

  // ─── Password Reset ────────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.userRepository.findByEmail(email.toLowerCase());

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If the email exists, a password reset link has been sent.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600_000); // 1 hour

    await this.userRepository.update(user.id, {
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires,
    });

    // Where the reset page lives: APP_BASE_URL, else the first allowed web origin.
    const baseUrl = (
      this.configService.get<string>('APP_BASE_URL') ||
      this.configService.get<string>('CORS_ORIGINS', 'http://localhost:3001').split(',')[0]
    )
      .trim()
      .replace(/\/$/, '');
    const webUrl = baseUrl.startsWith('http') ? baseUrl : 'http://localhost:3001';
    try {
      await this.emailService.sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        link: `${webUrl}/reset-password?token=${resetToken}`,
        expiresInMinutes: 60,
      });
    } catch (err) {
      // Same response either way so the endpoint can't be used to probe accounts.
      this.logger.error(`Password reset email failed for ${user.email}: ${(err as Error).message}`);
    }
    this.logger.log(`Password reset requested for: ${user.email}`);

    return { message: 'If the email exists, a password reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
    const user = await this.userRepository.findByPasswordResetToken(token);

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (user.passwordResetExpires && user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Reset token has expired. Please request a new one.');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await this.userRepository.update(user.id, {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
    });

    this.logger.log(`Password reset completed for: ${user.email}`);

    return { success: true };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const user = await this.getUserOrThrow(userId);

    if (!user.passwordHash) {
      throw new BadRequestException('Password change is not available for wallet-only accounts');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.userRepository.update(user.id, { passwordHash });

    this.logger.log(`Password changed for: ${user.email}`);
    return { success: true };
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private async generateTokenPair(user: User): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
    return this.tokenService.generateTokenPair(payload);
  }

  private async getUserOrThrow(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private sanitizeUser(user: User): Partial<User> {
    const { passwordHash, totpSecret, emailVerificationToken, passwordResetToken, passwordResetExpires, walletNonce, ...safe } = user;
    return safe;
  }
}
