import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { NotifyController } from "./notify.controller";
import { NotifyService } from "./notify.service";

/** global — any feature module can inject NotifyService */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [NotifyController],
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}
