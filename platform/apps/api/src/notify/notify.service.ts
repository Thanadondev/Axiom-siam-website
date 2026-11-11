import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { pick, isLang, type Lang, type Text } from "./text";

interface NotifyInput {
  userId: string;
  /** plain Thai, or { th, en, ja } to write it in the customer's language (User.locale) */
  title: Text;
  body?: Text;
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

  async push({ userId, title: t, body: b, link, email }: NotifyInput) {
    try {
      // written once, in the language the customer reads (the language they last picked on the site)
      let lang: Lang = "th";
      if (typeof t !== "string" || (b !== undefined && typeof b !== "string")) {
        const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
        if (isLang(u?.locale)) lang = u!.locale as Lang;
      }
      const title = pick(t, lang)!;
      const body = pick(b, lang);
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
