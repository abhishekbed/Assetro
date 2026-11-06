import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { TemplateService } from './template.service';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface SendTemplatedEmailParams {
  to: string | string[];
  subject: string;
  templateName: string;
  data: Record<string, unknown>;
}

export interface SendOtpEmailParams {
  to: string;
  code: string;
  name?: string;
  expiresInMinutes: number;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly senderEmail: string;
  private readonly appName: string;
  private transporter: nodemailer.Transporter | null = null;
  /** False when SMTP is unconfigured — emails are logged instead of sent. */
  private readonly smtpConfigured: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly templateService: TemplateService,
  ) {
    this.senderEmail =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('AWS_SES_FROM_EMAIL') ||
      'noreply@assetro.io';
    this.appName = this.configService.get<string>('APP_NAME', 'Assetro');

    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    // Google presents app passwords as "abcd efgh ijkl mnop"; SMTP AUTH needs
    // the 16 characters with no spaces, so strip whatever was pasted in.
    const pass = this.configService.get<string>('SMTP_PASSWORD')?.replace(/\s+/g, '');
    this.smtpConfigured = Boolean(host && user && pass);

    if (this.smtpConfigured) {
      const port = parseInt(this.configService.get<string>('SMTP_PORT', '587'), 10);
      this.transporter = nodemailer.createTransport({
        host,
        port,
        // 465 is implicit TLS; 587/25 start plaintext and upgrade via STARTTLS.
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`SMTP transport ready  host=${host}:${port}  from=${this.senderEmail}`);
    } else {
      this.logger.warn(
        'SMTP_HOST / SMTP_USER / SMTP_PASSWORD not set — emails will be logged, not sent. ' +
          'OTP codes appear in these logs so the signup flow stays testable.',
      );
    }
  }

  async sendEmail(params: SendEmailParams): Promise<void> {
    const toAddresses = Array.isArray(params.to) ? params.to : [params.to];

    if (!this.transporter) {
      this.logger.log(
        `[MOCK] Email to ${toAddresses.join(', ')} from ${this.senderEmail}: ${params.subject}`,
      );
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"${this.appName}" <${this.senderEmail}>`,
        to: toAddresses.join(', '),
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      this.logger.log(`Email sent to ${toAddresses.join(', ')}  messageId=${info.messageId}`);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(
        `Email send failed to ${toAddresses.join(', ')}: ${message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  async sendTemplatedEmail(params: SendTemplatedEmailParams): Promise<void> {
    const html = await this.templateService.compile(params.templateName, params.data);
    await this.sendEmail({ to: params.to, subject: params.subject, html });
  }

  /**
   * Deliver a signup verification code.
   *
   * When SMTP is unconfigured the code is written to the log at warn level so
   * the flow can still be exercised in local development.
   */
  async sendOtpEmail(params: SendOtpEmailParams): Promise<void> {
    const greeting = params.name ? `Hi ${params.name},` : 'Hi,';
    const subject = `${params.code} is your ${this.appName} verification code`;

    if (!this.transporter) {
      this.logger.warn(
        `[MOCK EMAIL] Verification code for ${params.to} is ${params.code} ` +
          `(valid ${params.expiresInMinutes} minutes)`,
      );
      return;
    }

    await this.sendEmail({
      to: params.to,
      subject,
      text:
        `${greeting}\n\nYour ${this.appName} verification code is ${params.code}.\n` +
        `It expires in ${params.expiresInMinutes} minutes.\n\n` +
        `If you did not request this, you can ignore this email.`,
      html: this.renderOtpHtml(
        greeting,
        params.code,
        params.expiresInMinutes,
      ),
    });
  }

  /**
   * Deliver a password-reset link. Without SMTP the link is written to the log
   * (warn level) so the flow can be exercised in local development.
   */
  async sendPasswordResetEmail(params: {
    to: string;
    name?: string;
    link: string;
    expiresInMinutes: number;
  }): Promise<void> {
    const greeting = params.name ? `Hi ${params.name},` : 'Hi,';

    if (!this.transporter) {
      this.logger.warn(
        `[MOCK EMAIL] Password reset link for ${params.to}: ${params.link} ` +
          `(valid ${params.expiresInMinutes} minutes)`,
      );
      return;
    }

    await this.sendEmail({
      to: params.to,
      subject: `Reset your ${this.appName} password`,
      text:
        `${greeting}\n\nUse this link to choose a new ${this.appName} password:\n${params.link}\n\n` +
        `It expires in ${params.expiresInMinutes} minutes. If you did not request this, you can ignore this email.`,
      html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Reset your password</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
                  ${greeting} click the button below to choose a new ${this.appName} password.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${params.link}" style="display:inline-block;padding:12px 24px;background:#f5c542;color:#111827;font-weight:700;text-decoration:none;border-radius:8px;">Reset password</a>
                </p>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#6b7280;">
                  This link expires in ${params.expiresInMinutes} minutes.
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
                  If you did not request this, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} ${this.appName}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    });
  }

  private renderOtpHtml(
    greeting: string,
    code: string,
    expiresInMinutes: number,
  ): string {
    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Verify your email</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
                  ${greeting} use the code below to finish creating your ${this.appName} account.
                </p>
                <div style="margin:0 0 24px;padding:20px;background:#f3f4f6;border-radius:10px;text-align:center;">
                  <span style="font-size:32px;font-weight:700;letter-spacing:10px;color:#111827;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</span>
                </div>
                
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#6b7280;">
                  This code expires in ${expiresInMinutes} minutes.
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
                  If you did not request this, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} ${this.appName}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }
}
