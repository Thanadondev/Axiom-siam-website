import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminController],
  providers: [AdminService], // AuditInterceptor is registered app-wide
})
export class AdminModule {}
