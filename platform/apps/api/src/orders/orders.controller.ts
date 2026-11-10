import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Public, Roles, CurrentUser, type AuthUser } from "../auth/decorators";
import { OrdersService } from "./orders.service";
import {
  CreateOrderSchema, PriceQuerySchema, UpdateOrderStatusSchema, OrderListQuerySchema, TaxInvoiceSchema, ProductionStepSchema, ErpLinkSchema,
  type CreateOrderDto, type PriceQueryDto, type UpdateOrderStatusDto, type OrderListQueryDto, type TaxInvoiceDto, type ProductionStepDto,
  type ErpLinkDto,
} from "./orders.dto";
import { ErpSyncService } from "../erp/erp-sync.service";
import { NasExportService } from "./nas-export";
import { RateLimitGuard, RateLimit } from "../common/rate-limit.guard";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // ---------- public pricing (checkout page shows the table before login) ----------
  @Public()
  @Get("price-table")
  table() {
    return this.orders.table();
  }

  /** delivery besides an address: the agent in Japan (name and fee) when it's set up */
  @Public()
  @Get("delivery-options")
  deliveryOptions() {
    return this.orders.deliveryOptions();
  }

  @Public()
  @Get("quote")
  quote(@Query(new ZodValidationPipe(PriceQuerySchema)) q: PriceQueryDto) {
    return this.orders.quote(q);
  }

  /** the public tracking page: the order number is enough (no names, prices or addresses) */
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 10 * 60_000 }) // slows walking through order numbers
  @Get("track/:no")
  track(@Param("no") no: string) {
    return this.orders.track(no);
  }

  // ---------- customer ----------
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(CreateOrderSchema)) dto: CreateOrderDto) {
    return this.orders.create(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.myOrders(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.orders.cancel(id, user.id);
  }

  /** the customer's (or, for them, an admin's) details for a full tax invoice */
  @UseGuards(JwtAuthGuard)
  @Put(":id/tax-invoice")
  taxInvoice(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(TaxInvoiceSchema)) dto: TaxInvoiceDto) {
    return this.orders.setTaxInvoice(id, user.id, dto, user.role === "admin");
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  one(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.orders.getOne(id, user.id, user.role === "admin");
  }
}

/** admin-only order management */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin/orders")
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService, private readonly erp: ErpSyncService, private readonly nas: NasExportService) {}

  @Get()
  list(@Query(new ZodValidationPipe(OrderListQuerySchema)) q: OrderListQueryDto) {
    return this.orders.adminList(q);
  }

  /** pull the production status of every linked order still on the floor from the ERP */
  @Post("erp/sync")
  syncErp(@CurrentUser() user: AuthUser) {
    return this.erp.syncActive(user.id);
  }

  @Get(":id")
  one(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.orders.getOne(id, user.id, true);
  }

  @Patch(":id/status")
  setStatus(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(UpdateOrderStatusSchema)) dto: UpdateOrderStatusDto) {
    return this.orders.adminSetStatus(id, user.id, dto);
  }

  /** where the job is on the production line (the customer sees it on their order) */
  @Patch(":id/step")
  setStep(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(ProductionStepSchema)) dto: ProductionStepDto) {
    return this.orders.adminSetStep(id, user.id, dto);
  }

  /** the same job's order number in the ERP; from then on the step follows the ERP */
  /** copy a paid order's zip into its job folder on the NAS now (it's also tried every couple of minutes) */
  @Post(":id/nas")
  async sendToNas(@Param("id") id: string) {
    const r = await this.nas.exportOrder(id);
    return r.ok
      ? { ok: true, message: `ส่งเข้า NAS แล้ว: ${r.folder}${r.copied ? "" : " (มีอยู่แล้ว)"}`, folder: r.folder }
      : { ok: false, message: r.error };
  }

  @Put(":id/erp")
  linkErp(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(ErpLinkSchema)) dto: ErpLinkDto) {
    return this.erp.link(id, user.id, dto.erpOrderNo, dto.force === true);
  }

  @Post(":id/erp/sync")
  syncOneErp(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.erp.syncOne(id, user.id);
  }
}
