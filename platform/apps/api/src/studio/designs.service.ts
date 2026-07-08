import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateDesignDto, UpdateDesignDto } from "./studio.dto";

@Injectable()
export class DesignsService {
  constructor(private prisma: PrismaService) {}

  create(userId: string, dto: CreateDesignDto) {
    return this.prisma.design.create({
      data: {
        userId,
        name: dto.name || "Untitled",
        mode: dto.mode || "reversible",
        stateJson: dto.stateJson,
        previewUrl: dto.previewUrl,
      },
      select: { id: true, name: true, previewUrl: true, mode: true, updatedAt: true },
    });
  }

  list(userId: string) {
    return this.prisma.design.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, previewUrl: true, mode: true, updatedAt: true },
    });
  }

  async get(userId: string, id: string) {
    const d = await this.prisma.design.findFirst({ where: { id, userId, deletedAt: null } });
    if (!d) throw new NotFoundException("ไม่พบดีไซน์");
    return d;
  }

  async update(userId: string, id: string, dto: UpdateDesignDto) {
    await this.get(userId, id);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.stateJson !== undefined) data.stateJson = dto.stateJson;
    if (dto.previewUrl !== undefined) data.previewUrl = dto.previewUrl;
    return this.prisma.design.update({
      where: { id },
      data,
      select: { id: true, name: true, previewUrl: true, mode: true, updatedAt: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await this.prisma.design.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: "ลบดีไซน์แล้ว" };
  }
}
