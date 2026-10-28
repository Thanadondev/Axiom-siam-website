import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles, CurrentUser, type AuthUser } from "../auth/decorators";
import { AdminService } from "./admin.service";
import { SettingsService } from "../settings/settings.service";
import { PaymentsService } from "../payments/payments.service";
import {
  ApproveSlipSchema, RejectSlipSchema, BankConfigSchema, RecordPaymentSchema,
  type ApproveSlipDto, type RejectSlipDto, type BankConfigDto, type RecordPaymentDto,
} from "../payments/payments.dto";
import {
  UpdatePricingSchema, UpdateMarketSchema, type UpdatePricingDto, type UpdateMarketDto,
} from "../settings/settings.dto";
import {
  ListQuerySchema, UpdateUserSchema, AdminTemplateSchema, UpdateReportSchema, CreatePayoutSchema, UpdateQuoteSchema,
  type ListQueryDto, type UpdateUserDto, type AdminTemplateDto, type UpdateReportDto, type CreatePayoutDto, type UpdateQuoteDto,
} from "./admin.dto";

/** every route here requires a logged-in user with role = admin.
 *  Auditing is applied app-wide (see app.module.ts), not here. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
  ) {}

  // ---------- editable platform settings ----------
  @Get("settings")
  getSettings() {
    return this.settings.all();
  }

  @Patch("settings/pricing")
  savePricing(@CurrentUser() me: AuthUser, @Body(new ZodValidationPipe(UpdatePricingSchema)) dto: UpdatePricingDto) {
    return this.settings.savePricing(dto, me.id);
  }

  @Patch("settings/market")
  saveMarket(@CurrentUser() me: AuthUser, @Body(new ZodValidationPipe(UpdateMarketSchema)) dto: UpdateMarketDto) {
    return this.settings.saveMarket(dto, me.id);
  }

  /** the company bank account customers transfer to */
  @Patch("settings/bank")
  saveBank(@CurrentUser() me: AuthUser, @Body(new ZodValidationPipe(BankConfigSchema)) dto: BankConfigDto) {
    return this.settings.saveBank(dto, me.id);
  }

  // ---------- slip review ----------
  /** the queue: slips customers uploaded, oldest first */
  @Get("payments")
  pendingSlips() {
    return this.payments.pendingSlips();
  }

  /**
   * Approve a slip — this is what actually marks an order paid, so it is the
   * single most consequential button in the admin. Audited app-wide.
   */
  @Post("payments/:id/approve")
  approveSlip(
    @CurrentUser() me: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ApproveSlipSchema)) dto: ApproveSlipDto,
  ) {
    return this.payments.approveSlip(me.id, id, dto);
  }

  /** money received outside the slip flow — the only other way an order becomes paid */
  @Post("orders/:id/payments")
  recordPayment(
    @CurrentUser() me: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RecordPaymentSchema)) dto: RecordPaymentDto,
  ) {
    return this.payments.recordManual(me.id, id, dto);
  }

  @Post("payments/:id/reject")
  rejectSlip(
    @CurrentUser() me: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RejectSlipSchema)) dto: RejectSlipDto,
  ) {
    return this.payments.rejectSlip(me.id, id, dto.reason);
  }

  // ---------- dashboard ----------
  @Get("stats")
  stats() {
    return this.admin.stats();
  }

  @Get("sales-series")
  salesSeries(@Query("days") days?: string) {
    return this.admin.salesSeries(Math.min(180, Math.max(7, Number(days) || 30)));
  }

  @Get("top-designers")
  topDesigners() {
    return this.admin.topDesigners();
  }

  @Get("top-templates")
  topTemplates() {
    return this.admin.topTemplates();
  }

  @Get("top-categories")
  topCategories() {
    return this.admin.topCategories();
  }

  // ---------- users ----------
  @Get("users")
  listUsers(@Query(new ZodValidationPipe(ListQuerySchema)) q: ListQueryDto) {
    return this.admin.listUsers(q);
  }

  @Get("users/:id")
  getUser(@Param("id") id: string) {
    return this.admin.getUser(id);
  }

  @Patch("users/:id")
  updateUser(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(UpdateUserSchema)) dto: UpdateUserDto) {
    return this.admin.updateUser(me.id, id, dto);
  }

  // ---------- marketplace moderation ----------
  @Get("templates")
  listTemplates(@Query(new ZodValidationPipe(ListQuerySchema)) q: ListQueryDto) {
    return this.admin.listTemplates(q);
  }

  @Patch("templates/:id")
  updateTemplate(@Param("id") id: string, @Body(new ZodValidationPipe(AdminTemplateSchema)) dto: AdminTemplateDto) {
    return this.admin.updateTemplate(id, dto);
  }

  // ---------- reports ----------
  @Get("reports")
  listReports(@Query(new ZodValidationPipe(ListQuerySchema)) q: ListQueryDto) {
    return this.admin.listReports(q);
  }

  @Patch("reports/:id")
  updateReport(@Param("id") id: string, @Body(new ZodValidationPipe(UpdateReportSchema)) dto: UpdateReportDto) {
    return this.admin.updateReport(id, dto);
  }

  // ---------- payouts ----------
  @Get("payouts/pending")
  pendingPayouts() {
    return this.admin.pendingPayouts();
  }

  @Get("payouts")
  listPayouts(@Query(new ZodValidationPipe(ListQuerySchema)) q: ListQueryDto) {
    return this.admin.listPayouts(q);
  }

  @Post("payouts")
  createPayout(@CurrentUser() me: AuthUser, @Body(new ZodValidationPipe(CreatePayoutSchema)) dto: CreatePayoutDto) {
    return this.admin.createPayout(me.id, dto);
  }

  // ---------- quotes ----------
  @Get("quotes")
  listQuotes(@Query(new ZodValidationPipe(ListQuerySchema)) q: ListQueryDto) {
    return this.admin.listQuotes(q);
  }

  @Patch("quotes/:id")
  updateQuote(@Param("id") id: string, @Body(new ZodValidationPipe(UpdateQuoteSchema)) dto: UpdateQuoteDto) {
    return this.admin.updateQuote(id, dto);
  }

  // ---------- deep analytics ----------
  @Get("funnel")
  funnel() {
    return this.admin.funnel();
  }

  @Get("monthly-revenue")
  monthlyRevenue(@Query("months") months?: string) {
    return this.admin.monthlyRevenue(Math.min(24, Math.max(3, Number(months) || 12)));
  }

  @Get("cohorts")
  cohorts(@Query("months") months?: string) {
    return this.admin.cohorts(Math.min(24, Math.max(3, Number(months) || 6)));
  }

  // ---------- admin action audit trail ----------
  @Get("audit")
  audit(@Query(new ZodValidationPipe(ListQuerySchema)) q: ListQueryDto) {
    return this.admin.auditLog(q);
  }

  @Get("audit/actions")
  auditActions() {
    return this.admin.auditActions();
  }

  // ---------- CSV export ----------
  @Get("export/:kind")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportCsv(@Param("kind") kind: string, @Res({ passthrough: true }) res: Response) {
    const allowed = ["orders", "sales", "users", "payouts", "audit"] as const;
    const k = (allowed as readonly string[]).includes(kind) ? (kind as (typeof allowed)[number]) : "orders";
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="axiom-${k}-${stamp}.csv"`);
    return this.admin.exportCsv(k);
  }

  // ---------- legal audit log ----------
  @Get("terms-log")
  termsLog(@Query(new ZodValidationPipe(ListQuerySchema)) q: ListQueryDto) {
    return this.admin.termsLog(q);
  }
}
