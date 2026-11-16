import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MarketController } from "./market.controller";
import { MarketService } from "./market.service";
import { RateLimitGuard } from "../common/rate-limit.guard";

@Module({
  imports: [JwtModule.register({})],
  controllers: [MarketController],
  providers: [MarketService, RateLimitGuard],
})
export class MarketModule {}
