import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { OrdersController, AdminOrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
