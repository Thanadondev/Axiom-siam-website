import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

interface NotifyInput {
  userId: string;
  title: string;
  body?: string;
  link?: string;
  /** also log an outbound email (MailService is a console stub for now) */
  email?: boolean;
}

/**
 * In-app notifications. Every call is best-effort: a notification must never
 * break the business action that triggered it, so failures are swallowed.
 */
@Injectable()
export class NotifyService {
  private readonly log = new Logger("Notify");
  private site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  constructor(private prisma: PrismaService) {}

  async push({ userId, title, body, link, email }: NotifyInput) {
    try {
      await this.prisma.notification.create({
        data: { userId, title, body, link, channel: email ? "email" : "in_app" },
      });
      if (email) this.log.log(`[email] user=${userId} "${title}" ${link ? this.site + link : ""}`);
    } catch (e) {
      this.log.warn(`notify failed: ${(e as Error).message}`);
    }
  }

  /** notify every admin (e.g. a new abuse report came in) */
  async pushAdmins(title: string, body?: string, link?: string) {
    try {
      const admins = await this.prisma.user.findMany({ where: { role: "admin", deletedAt: null }, select: { id: true } });
      await Promise.all(admins.map(a => this.push({ userId: a.id, title, body, link })));
    } catch (e) {
      this.log.warn(`notifyAdmins failed: ${(e as Error).message}`);
    }
  }

  // ---------- read side ----------
  async list(userId: string, take = 30) {
    return this.prisma.notification.findMany({
      where: { userId }, orderBy: { createdAt: "desc" }, take,
      select: { id: true, title: true, body: true, link: true, isRead: true, createdAt: true },
    });
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { count };
  }

  async markRead(userId: string, id?: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false, ...(id ? { id } : {}) },
      data: { isRead: true },
    });
    return { message: "อ่านแล้ว" };
  }
}
