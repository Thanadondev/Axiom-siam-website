import { config } from "dotenv";
import { resolve } from "path";

/**
 * Loads .env before anything else. main.ts imports this first: imports run
 * before main's own code, and some modules read process.env as they load
 * (the bank account defaults in settings.service.ts, the price defaults in
 * pricing.ts) — loading .env later in main left those empty, so payments
 * stayed "not open" with BANK_ACCOUNT_NO set. Never overrides real env vars.
 */
config({ path: resolve(process.cwd(), ".env") }); // when run from repo root
config({ path: resolve(__dirname, "../../../.env") }); // when run from apps/api (dist)
