import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateQuoteDto } from "./studio.dto";

@Injectable()
export class QuotesService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateQuoteDto, userId: string | null) {
    return this.prisma.quoteRequest.create({
      data: {
        userId: userId || null,
        name: dto.name,
        email: dto.email || null,
        phone: dto.phone || null,
        message: dto.message || null,
        designId: dto.designId || null,
      },
      select: { id: true, status: true, createdAt: true },
    });
  }
}
