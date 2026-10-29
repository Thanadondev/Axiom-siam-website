import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { OrdersController, AdminOrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { ErpSyncService } from "../erp/erp-sync.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, ErpSyncService],
  exports: [OrdersService, ErpSyncService],
})
export class OrdersModule {}
