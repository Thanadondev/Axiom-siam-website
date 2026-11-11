import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { OrdersController, AdminOrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OrderFilesController } from "./order-files.controller";
import { OrderFilesService } from "./order-files.service";
import { NasExportService } from "./nas-export";
import { ErpSyncService } from "../erp/erp-sync.service";
import { RateLimitGuard } from "../common/rate-limit.guard";
import { BibJobService } from "../bibs/bib-jobs.service";
import { BibsController, AdminBibsController } from "../bibs/bibs.controller";

@Module({
  imports: [JwtModule.register({})],
  controllers: [OrdersController, AdminOrdersController, OrderFilesController, BibsController, AdminBibsController],
  providers: [OrdersService, OrderFilesService, NasExportService, ErpSyncService, RateLimitGuard, BibJobService],
  exports: [OrdersService, ErpSyncService],
})
export class OrdersModule {}
