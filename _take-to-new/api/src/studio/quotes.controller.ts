import { Body, Controller, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { JwtService } from "@nestjs/jwt";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { QuotesService } from "./quotes.service";
import { CreateQuoteSchema, type CreateQuoteDto } from "./studio.dto";

@Controller("quotes")
export class QuotesController {
  constructor(private readonly quotes: QuotesService, private readonly jwt: JwtService) {}

  @Post()
  async create(@Req() req: Request, @Body(new ZodValidationPipe(CreateQuoteSchema)) dto: CreateQuoteDto) {
    // link to a user if a valid access token was sent, otherwise treat as guest
    let userId: string | null = null;
    const h = req.headers.authorization;
    if (h && h.startsWith("Bearer ")) {
      try {
        const payload = await this.jwt.verifyAsync(h.slice(7), { secret: process.env.JWT_ACCESS_SECRET });
        userId = (payload as { sub: string }).sub;
      } catch {
        /* ignore invalid token, stay guest */
      }
    }
    return this.quotes.create(dto, userId);
  }
}
