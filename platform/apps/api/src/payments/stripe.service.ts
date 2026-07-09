import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import Stripe from "stripe";

/**
 * Thin wrapper around the Stripe SDK.
 *
 * The API must still boot (and every other feature must still work) when no
 * Stripe key is configured — e.g. on a fresh clone, or in CI. So the client is
 * created lazily and `enabled` tells callers whether payments are available.
 *
 * Secrets come from the environment only. Never hard-code a key.
 *   STRIPE_SECRET_KEY      sk_test_... / sk_live_...
 *   STRIPE_WEBHOOK_SECRET  whsec_...
 */
@Injectable()
export class StripeService {
  private readonly log = new Logger("Stripe");
  private client: Stripe | null = null;

  get enabled(): boolean {
    return !!process.env.STRIPE_SECRET_KEY;
  }

  get livemode(): boolean {
    return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
  }

  get webhookSecret(): string | undefined {
    return process.env.STRIPE_WEBHOOK_SECRET;
  }

  get stripe(): Stripe {
    if (!this.enabled) {
      throw new ServiceUnavailableException("ระบบชำระเงินยังไม่ได้ตั้งค่า (ไม่พบ STRIPE_SECRET_KEY)");
    }
    if (!this.client) {
      this.client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        // pin the version so a Stripe-side upgrade can't change our payloads
        apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
        appInfo: { name: "Axiom Siam", version: "0.1.0" },
      });
      this.log.log(`Stripe ready (${this.livemode ? "LIVE" : "test"} mode)`);
    }
    return this.client;
  }

  /** verifies the signature over the exact bytes Stripe sent */
  constructEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException("ไม่พบ STRIPE_WEBHOOK_SECRET");
    }
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
