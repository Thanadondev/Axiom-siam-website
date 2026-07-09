import { BadRequestException, Controller, Get, Headers, Param, Post, Req, UseGuards, Logger } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Public, CurrentUser, type AuthUser } from "../auth/decorators";
import { PaymentsService } from "./payments.service";
import { StripeService } from "./stripe.service";

@Controller("payments")
export class PaymentsController {
  private readonly log = new Logger("PaymentsController");

  constructor(private readonly payments: PaymentsService, private readonly stripe: StripeService) {}

  /** the frontend hides the pay button when payments aren't configured */
  @Public()
  @Get("status")
  status() {
    return this.payments.status();
  }

  @UseGuards(JwtAuthGuard)
  @Post("orders/:id/checkout")
  checkout(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.payments.createCheckout(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("orders/:id/state")
  state(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.payments.paymentState(user.id, id);
  }

  /**
   * Stripe → us. Public by necessity; authenticated by signature.
   *
   * We return 2xx as fast as we can: an un-acknowledged webhook is retried,
   * and a 500 here would make Stripe hammer us. Any processing error is
   * logged and surfaced as 400 only when the *signature* is bad.
   */
  @Public()
  @Post("webhook")
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers("stripe-signature") signature: string) {
    if (!signature) throw new BadRequestException("missing stripe-signature header");
    if (!req.rawBody) throw new BadRequestException("raw body unavailable — check rawBody:true in main.ts");

    let event;
    try {
      event = this.stripe.constructEvent(req.rawBody, signature);
    } catch (e: any) {
      // a bad signature is either a misconfigured secret or someone probing us
      this.log.warn(`webhook signature verification failed: ${e.message}`);
      throw new BadRequestException(`Webhook Error: ${e.message}`);
    }

    try {
      return await this.payments.handleEvent(event);
    } catch (e: any) {
      // acknowledge anyway; the event is logged and can be replayed from the
      // Stripe dashboard. Failing here would trigger endless retries.
      this.log.error(`error handling ${event.type}: ${e.message}`);
      return { received: true, handled: false };
    }
  }
}
