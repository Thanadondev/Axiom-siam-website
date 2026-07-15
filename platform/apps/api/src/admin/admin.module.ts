import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PaymentsModule } from "../payments/payments.module";

@Module({
  // PaymentsModule: the slip review queue is driven through PaymentsService
  imports: [JwtModule.register({}), PaymentsModule],
  controllers: [AdminController],
  providers: [AdminService], // AuditInterceptor is registered app-wide
})
export class AdminModule {}
