import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DesignsController } from "./designs.controller";
import { DesignsService } from "./designs.service";
import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [DesignsController, QuotesController],
  providers: [DesignsService, QuotesService],
})
export class StudioModule {}
