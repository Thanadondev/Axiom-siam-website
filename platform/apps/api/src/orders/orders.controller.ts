import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Public, Roles, CurrentUser, type AuthUser } from "../auth/decorators";
import { OrdersService } from "./orders.service";
import {
  CreateOrderSchema, PriceQuerySchema, UpdateOrderStatusSchema, OrderListQuerySchema, TaxInvoiceSchema, ProductionStepSchema,
  type CreateOrderDto, type PriceQueryDto, type UpdateOrderStatusDto, type OrderListQueryDto, type TaxInvoiceDto, type ProductionStepDto,
} from "./orders.dto";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // ---------- public pricing (checkout page shows the table before login) ----------
  @Public()
  @Get("price-table")
  table() {
    return this.orders.table();
  }

  @Public()
  @Get("quote")
  quote(@Query(new ZodValidationPipe(PriceQuerySchema)) q: PriceQueryDto) {
    return this.orders.quote(q);
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
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query(new ZodValidationPipe(OrderListQuerySchema)) q: OrderListQueryDto) {
    return this.orders.adminList(q);
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
}
