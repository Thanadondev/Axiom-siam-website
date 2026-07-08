import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/decorators";
import { DesignsService } from "./designs.service";
import { CreateDesignSchema, UpdateDesignSchema, type CreateDesignDto, type UpdateDesignDto } from "./studio.dto";

@UseGuards(JwtAuthGuard)
@Controller("designs")
export class DesignsController {
  constructor(private readonly designs: DesignsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(CreateDesignSchema)) dto: CreateDesignDto) {
    return this.designs.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.designs.list(user.id);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.designs.get(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(UpdateDesignSchema)) dto: UpdateDesignDto) {
    return this.designs.update(user.id, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.designs.remove(user.id, id);
  }
}
