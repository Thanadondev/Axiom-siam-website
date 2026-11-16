import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  FabricDto, FabricPatchDto, SizeDto, SizePatchDto, ColorDto, ColorPatchDto,
} from "./catalog.dto";

const dup = (e: unknown) => (e as { code?: string })?.code === "P2002";

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  /** public: everything the designer / checkout needs */
  async publicCatalog() {
    const [fabrics, sizes, colors] = await this.prisma.$transaction([
      this.prisma.fabric.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      this.prisma.size.findMany({ orderBy: { sortOrder: "asc" } }),
      this.prisma.color.findMany({ orderBy: { sortOrder: "asc" } }),
    ]);
    return { fabrics, sizes, colors };
  }

  // ---------- fabrics ----------
  fabrics() {
    return this.prisma.fabric.findMany({ orderBy: { code: "asc" } });
  }
  async createFabric(dto: FabricDto) {
    try { return await this.prisma.fabric.create({ data: dto }); }
    catch (e) { throw dup(e) ? new BadRequestException(`มีรหัสผ้า "${dto.code}" อยู่แล้ว`) : e; }
  }
  async updateFabric(id: string, dto: FabricPatchDto) {
    await this.mustExist("fabric", id);
    try { return await this.prisma.fabric.update({ where: { id }, data: dto }); }
    catch (e) { throw dup(e) ? new BadRequestException("รหัสผ้าซ้ำ") : e; }
  }
  async removeFabric(id: string) {
    await this.mustExist("fabric", id);
    const used = await this.prisma.design.count({ where: { fabricId: id } });
    if (used > 0) {
      // keep referential integrity: hide instead of delete
      await this.prisma.fabric.update({ where: { id }, data: { isActive: false } });
      return { message: `มีดีไซน์ใช้ผ้านี้อยู่ ${used} รายการ — ปิดใช้งานแทนการลบ` };
    }
    await this.prisma.fabric.delete({ where: { id } });
    return { message: "ลบชนิดผ้าแล้ว" };
  }

  // ---------- sizes ----------
  sizes() {
    return this.prisma.size.findMany({ orderBy: { sortOrder: "asc" } });
  }
  async createSize(dto: SizeDto) {
    try { return await this.prisma.size.create({ data: dto }); }
    catch (e) { throw dup(e) ? new BadRequestException(`มีไซส์ "${dto.code}" อยู่แล้ว`) : e; }
  }
  async updateSize(id: string, dto: SizePatchDto) {
    await this.mustExist("size", id);
    return this.prisma.size.update({ where: { id }, data: dto });
  }
  async removeSize(id: string) {
    await this.mustExist("size", id);
    await this.prisma.size.delete({ where: { id } });
    return { message: "ลบไซส์แล้ว" };
  }

  // ---------- colors ----------
  colors() {
    return this.prisma.color.findMany({ orderBy: { sortOrder: "asc" } });
  }
  async createColor(dto: ColorDto) {
    try { return await this.prisma.color.create({ data: { ...dto, hex: dto.hex.toUpperCase() } }); }
    catch (e) { throw dup(e) ? new BadRequestException(`มีสี ${dto.hex} อยู่แล้ว`) : e; }
  }
  async updateColor(id: string, dto: ColorPatchDto) {
    await this.mustExist("color", id);
    return this.prisma.color.update({ where: { id }, data: dto.hex ? { ...dto, hex: dto.hex.toUpperCase() } : dto });
  }
  async removeColor(id: string) {
    await this.mustExist("color", id);
    await this.prisma.color.delete({ where: { id } });
    return { message: "ลบสีแล้ว" };
  }

  private async mustExist(model: "fabric" | "size" | "color", id: string) {
    const row = await (this.prisma[model] as any).findUnique({ where: { id } });
    if (!row) throw new NotFoundException("ไม่พบรายการ");
    return row;
  }
}
