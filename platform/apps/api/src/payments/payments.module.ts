import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { StorageService } from "./storage.service";

// SettingsModule and NotifyModule are @Global — no need to import them here
@Module({
  imports: [JwtModule.register({})],
  controllers: [PaymentsController],
  providers: [PaymentsService, StorageService],
  // the admin module drives the slip review queue through PaymentsService
  exports: [PaymentsService, StorageService],
})
export class PaymentsModule {}
