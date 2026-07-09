import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators";
import { CatalogService } from "./catalog.service";
import {
  FabricSchema, FabricPatchSchema, SizeSchema, SizePatchSchema, ColorSchema, ColorPatchSchema,
  type FabricDto, type FabricPatchDto, type SizeDto, type SizePatchDto, type ColorDto, type ColorPatchDto,
} from "./catalog.dto";

/** public read — the designer & checkout need fabrics/sizes/colors */
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  all() {
    return this.catalog.publicCatalog();
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin/catalog")
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // fabrics
  @Get("fabrics") fabrics() { return this.catalog.fabrics(); }
  @Post("fabrics") addFabric(@Body(new ZodValidationPipe(FabricSchema)) dto: FabricDto) { return this.catalog.createFabric(dto); }
  @Patch("fabrics/:id") editFabric(@Param("id") id: string, @Body(new ZodValidationPipe(FabricPatchSchema)) dto: FabricPatchDto) { return this.catalog.updateFabric(id, dto); }
  @Delete("fabrics/:id") delFabric(@Param("id") id: string) { return this.catalog.removeFabric(id); }

  // sizes
  @Get("sizes") sizes() { return this.catalog.sizes(); }
  @Post("sizes") addSize(@Body(new ZodValidationPipe(SizeSchema)) dto: SizeDto) { return this.catalog.createSize(dto); }
  @Patch("sizes/:id") editSize(@Param("id") id: string, @Body(new ZodValidationPipe(SizePatchSchema)) dto: SizePatchDto) { return this.catalog.updateSize(id, dto); }
  @Delete("sizes/:id") delSize(@Param("id") id: string) { return this.catalog.removeSize(id); }

  // colors
  @Get("colors") colors() { return this.catalog.colors(); }
  @Post("colors") addColor(@Body(new ZodValidationPipe(ColorSchema)) dto: ColorDto) { return this.catalog.createColor(dto); }
  @Patch("colors/:id") editColor(@Param("id") id: string, @Body(new ZodValidationPipe(ColorPatchSchema)) dto: ColorPatchDto) { return this.catalog.updateColor(id, dto); }
  @Delete("colors/:id") delColor(@Param("id") id: string) { return this.catalog.removeColor(id); }
}
