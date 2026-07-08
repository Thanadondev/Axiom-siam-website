import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "./mail.service";
import type {
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  AddressDto,
  AddressUpdateDto,
} from "./auth.dto";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const randomToken = () => randomBytes(32).toString("hex");
const days = (n: number) => new Date(Date.now() + n * 86400_000);
const hours = (n: number) => new Date(Date.now() + n * 3600_000);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
  ) {}

  // ---------- register ----------
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException("อีเมลนี้ถูกใช้แล้ว");

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone,
        companyName: dto.companyName,
        role: "customer",
      },
    });

    await this.createTokenAndSendVerify(user.id, user.email);
    return { message: "สมัครสำเร็จ กรุณายืนยันอีเมล", userId: user.id };
  }

  private async createTokenAndSendVerify(userId: string, email: string) {
    const raw = randomToken();
    await this.prisma.authToken.create({
      data: { userId, type: "email_verify", token: sha256(raw), expiresAt: hours(24) },
    });
    await this.mail.sendVerifyEmail(email, raw);
  }

  async verifyEmail(token: string) {
    const rec = await this.prisma.authToken.findUnique({ where: { token: sha256(token) } });
    if (!rec || rec.type !== "email_verify" || rec.revokedAt || rec.expiresAt < new Date())
      throw new BadRequestException("ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ");

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: rec.userId }, data: { isVerified: true } }),
      this.prisma.authToken.update({ where: { id: rec.id }, data: { revokedAt: new Date() } }),
    ]);
    return { message: "ยืนยันอีเมลสำเร็จ" };
  }

  // ---------- login ----------
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException("อีเมลหรือรหัสผ่านไม่ถูกต้อง");

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("อีเมลหรือรหัสผ่านไม่ถูกต้อง");

    const tokens = await this.issueTokens(user.id, user.role);
    return { ...tokens, user: this.publicUser(user) };
  }

  // ---------- tokens ----------
  private async issueTokens(userId: string, role: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, role },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_TTL ?? "15m" },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, role, typ: "refresh" },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: process.env.JWT_REFRESH_TTL ?? "30d" },
    );
    await this.prisma.authToken.create({
      data: { userId, type: "refresh", token: sha256(refreshToken), expiresAt: days(30) },
    });
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException("ไม่มี refresh token");
    let payload: { sub: string; role: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException("refresh token ไม่ถูกต้อง");
    }
    const rec = await this.prisma.authToken.findUnique({ where: { token: sha256(refreshToken) } });
    if (!rec || rec.revokedAt || rec.expiresAt < new Date())
      throw new UnauthorizedException("session หมดอายุ กรุณาเข้าสู่ระบบใหม่");

    // rotate: revoke old, issue new
    await this.prisma.authToken.update({ where: { id: rec.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(payload.sub, payload.role);
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.authToken
        .updateMany({ where: { token: sha256(refreshToken) }, data: { revokedAt: new Date() } })
        .catch(() => undefined);
    }
    return { message: "ออกจากระบบแล้ว" };
  }

  // ---------- password reset ----------
  async requestReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const raw = randomToken();
      await this.prisma.authToken.create({
        data: { userId: user.id, type: "password_reset", token: sha256(raw), expiresAt: hours(1) },
      });
      await this.mail.sendResetEmail(email, raw);
    }
    // do not reveal whether the email exists
    return { message: "หากอีเมลมีอยู่ในระบบ เราได้ส่งลิงก์รีเซ็ตให้แล้ว" };
  }

  async resetPassword(token: string, password: string) {
    const rec = await this.prisma.authToken.findUnique({ where: { token: sha256(token) } });
    if (!rec || rec.type !== "password_reset" || rec.revokedAt || rec.expiresAt < new Date())
      throw new BadRequestException("ลิงก์รีเซ็ตไม่ถูกต้องหรือหมดอายุ");

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
      this.prisma.authToken.update({ where: { id: rec.id }, data: { revokedAt: new Date() } }),
      // revoke all active refresh tokens for safety
      this.prisma.authToken.updateMany({
        where: { userId: rec.userId, type: "refresh", revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: "ตั้งรหัสผ่านใหม่สำเร็จ" };
  }

  // ---------- profile ----------
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  // ---------- profile ----------
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim() || null;
    if (dto.phone !== undefined) data.phone = dto.phone.trim() || null;
    if (dto.companyName !== undefined) data.companyName = dto.companyName.trim() || null;
    if (dto.locale !== undefined) data.locale = dto.locale;
    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return this.publicUser(user);
  }

  // ---------- addresses ----------
  async listAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async createAddress(userId: string, dto: AddressDto) {
    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    }
    return this.prisma.address.create({
      data: {
        userId,
        label: dto.label,
        recipient: dto.recipient,
        phone: dto.phone,
        line1: dto.line1,
        line2: dto.line2,
        district: dto.district,
        province: dto.province,
        postalCode: dto.postalCode,
        country: dto.country ?? "TH",
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async updateAddress(userId: string, id: string, dto: AddressUpdateDto) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("ไม่พบที่อยู่");
    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    }
    return this.prisma.address.update({ where: { id }, data: dto });
  }

  async deleteAddress(userId: string, id: string) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("ไม่พบที่อยู่");
    await this.prisma.address.delete({ where: { id } });
    return { message: "ลบที่อยู่แล้ว" };
  }

  private publicUser(u: {
    id: string;
    email: string;
    fullName: string | null;
    phone: string | null;
    companyName: string | null;
    role: string;
    isVerified: boolean;
    locale: string;
  }) {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      phone: u.phone,
      companyName: u.companyName,
      role: u.role,
      isVerified: u.isVerified,
      locale: u.locale,
    };
  }
}
