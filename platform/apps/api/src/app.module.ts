import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuditInterceptor } from "./admin/audit.interceptor";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { StudioModule } from "./studio/studio.module";
import { MarketModule } from "./market/market.module";
import { AdminModule } from "./admin/admin.module";
import { OrdersModule } from "./orders/orders.module";
import { SettingsModule } from "./settings/settings.module";
import { NotifyModule } from "./notify/notify.module";
import { CatalogModule } from "./catalog/catalog.module";
import { PaymentsModule } from "./payments/payments.module";
import { HealthController } from "./health/health.controller";

// ✅ Auth · Studio · Market · Admin · Orders · Settings · Notify · Catalog · Payments
@Module({
  imports: [
    PrismaModule, SettingsModule, NotifyModule,
    AuthModule, StudioModule, MarketModule, AdminModule, OrdersModule, CatalogModule, PaymentsModule,
  ],
  controllers: [HealthController],
  providers: [
    // audits EVERY non-GET request under /admin — including admin controllers
    // that live outside AdminModule (orders, catalog). Registering it per
    // controller meant a new admin controller silently escaped the trail.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
