import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import { EmailOtp, OtpPurpose } from '../entities/email-otp.entity';
import { EmailService } from './email.service';

/** How long a code stays valid. */
const TTL_MINUTES = 10;
/** Wrong guesses allowed before the code is burned. */
const MAX_ATTEMPTS = 5;
/** Minimum gap between two sends to the same address for the same purpose. */
const RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(EmailOtp)
    private readonly otpRepo: Repository<EmailOtp>,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Generate a 6-digit code, email it, and store only its hash.
   *
   * Any earlier unconsumed code for the same (email, purpose) is invalidated
   * first, so a resend always supersedes what came before.
   */
  async issue(
    email: string,
    purpose: OtpPurpose,
    name?: string,
  ): Promise<void> {
    const normalized = email.toLowerCase();

    const latest = await this.otpRepo.findOne({
      where: { email: normalized, purpose },
      order: { createdAt: 'DESC' },
    });

    if (latest && !latest.consumedAt) {
      const secondsSince = (Date.now() - latest.createdAt.getTime()) / 1000;
      if (secondsSince < RESEND_COOLDOWN_SECONDS) {
        throw new HttpException(
          `Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSince)}s before requesting another code.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Supersede every outstanding code for this address + purpose.
    await this.otpRepo.delete({ email: normalized, purpose, consumedAt: IsNull() });

    const code = this.generateCode();

    await this.otpRepo.save(
      this.otpRepo.create({
        email: normalized,
        purpose,
        codeHash: this.hash(code),
        payloadHash: null,
        expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
        attempts: 0,
        consumedAt: null,
      }),
    );

    await this.emailService.sendOtpEmail({
      to: normalized,
      code,
      name,
      expiresInMinutes: TTL_MINUTES,
    });

    this.logger.log(`OTP issued  email=${normalized}  purpose=${purpose}`);
  }

  /**
   * Check a submitted code and consume it on success.
   *
   * Throws BadRequestException on every failure path — expired, wrong, already
   * used, or never issued — with a message the UI can show as-is.
   */
  async verify(
    email: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<{ payloadHash: string | null }> {
    const normalized = email.toLowerCase();

    const otp = await this.otpRepo.findOne({
      where: { email: normalized, purpose },
      order: { createdAt: 'DESC' },
    });

    if (!otp || otp.consumedAt) {
      throw new BadRequestException(
        'No verification code is pending for this email. Please request a new one.',
      );
    }

    if (otp.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This code has expired. Please request a new one.');
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Too many incorrect attempts. Please request a new code.',
      );
    }

    if (!this.matches(code, otp.codeHash)) {
      await this.otpRepo.update(otp.id, { attempts: otp.attempts + 1 });
      const left = MAX_ATTEMPTS - (otp.attempts + 1);
      throw new BadRequestException(
        left > 0
          ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} remaining.`
          : 'Incorrect code. Please request a new one.',
      );
    }

    await this.otpRepo.update(otp.id, { consumedAt: new Date() });
    this.logger.log(`OTP verified  email=${normalized}  purpose=${purpose}`);

    return { payloadHash: otp.payloadHash };
  }

  /** Drop codes that expired over a day ago. Safe to call from a cron. */
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await this.otpRepo.delete({ expiresAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }

  private generateCode(): string {
    // crypto.randomInt is uniform over the range — Math.random() is not, and a
    // predictable signup code is a takeover of any address an attacker knows.
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hash(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private matches(code: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(code.trim()), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  }
}
