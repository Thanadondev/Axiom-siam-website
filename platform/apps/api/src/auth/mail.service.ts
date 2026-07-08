import { Injectable, Logger } from "@nestjs/common";

/**
 * Dev stub — logs links to console. Plug Resend/SES in Phase 1 finalisation.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger("MailService");
  private site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  async sendVerifyEmail(email: string, token: string) {
    this.log.log(`[verify-email] ${email} -> ${this.site}/verify?token=${token}`);
  }

  async sendResetEmail(email: string, token: string) {
    this.log.log(`[reset-password] ${email} -> ${this.site}/reset-password?token=${token}`);
  }
}
