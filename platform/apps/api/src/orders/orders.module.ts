import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { OrdersController, AdminOrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { ErpSyncService } from "../erp/erp-sync.service";
import { RateLimitGuard } from "../common/rate-limit.guard";

@Module({
  imports: [JwtModule.register({})],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, ErpSyncService, RateLimitGuard],
  exports: [OrdersService, ErpSyncService],
})
export class OrdersModule {}
