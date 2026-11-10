import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DesignsController } from "./designs.controller";
import { DesignsService } from "./designs.service";
import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";
import { KitAssetsController } from "./kit-assets.controller";
import { KitAssetStore } from "./kit-asset-store";

@Module({
  imports: [JwtModule.register({})],
  controllers: [DesignsController, QuotesController, KitAssetsController],
  providers: [DesignsService, QuotesService, KitAssetStore],
})
export class StudioModule {}
