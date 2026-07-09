import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

// Load env before the app (and Prisma) initialise. Won't override real env vars.
loadEnv({ path: resolve(process.cwd(), ".env") }); // when run from repo root
loadEnv({ path: resolve(__dirname, "../../../.env") }); // when run from apps/api (dist)

async function bootstrap() {
  // rawBody: Stripe signs the exact bytes it sent. Re-serialising the JSON
  // breaks signature verification, so the webhook route reads `req.rawBody`.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.enableCors({
    // dev: accept any localhost:<port>; also accept the configured origin
    origin: (origin, cb) => {
      if (!origin || /^http:\/\/localhost:\d+$/.test(origin) || origin === process.env.CORS_ORIGIN) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
  });
  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}/api/v1`);
}
bootstrap();
