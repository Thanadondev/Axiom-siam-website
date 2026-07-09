import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { StripeService } from "./stripe.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeService],
  exports: [StripeService],
})
export class PaymentsModule {}
