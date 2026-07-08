import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MarketController } from "./market.controller";
import { MarketService } from "./market.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}
