import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { StudioModule } from "./studio/studio.module";
import { MarketModule } from "./market/market.module";
import { HealthController } from "./health/health.controller";

// Feature modules added per phase:
//   ✅ AuthModule  ·  next: DesignsModule, ProductsModule, CartModule,
//   OrdersModule, PaymentsModule, TrackingModule, AdminModule
@Module({
  imports: [PrismaModule, AuthModule, StudioModule, MarketModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
