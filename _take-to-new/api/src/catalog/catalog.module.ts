import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { CatalogController, AdminCatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
