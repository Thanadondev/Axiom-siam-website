import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import express from "express";
import { AppModule } from "./app.module";

// Load env before the app (and Prisma) initialise. Won't override real env vars.
loadEnv({ path: resolve(process.cwd(), ".env") }); // when run from repo root
loadEnv({ path: resolve(__dirname, "../../../.env") }); // when run from apps/api (dist)

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());

  // Slips arrive base64 inside JSON. Express defaults to a 100kb body, which
  // every phone screenshot exceeds — without this, upload fails with 413.
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ limit: "12mb", extended: true }));

  // Serve uploaded slips. The path contains the order's uuid, so it is not
  // enumerable, but it IS unauthenticated — anyone holding the link can view
  // the image. Move this behind a guard (or signed URLs) before going live.
  const uploadDir = resolve(process.env.UPLOAD_DIR ?? "./uploads");
  // Team logos and fonts (kit studio). Named by content hash, so they never change:
  // cache for a year. The web app draws them into WebGL from another origin, which
  // needs CORS; they are print artwork, not personal data.
  app.use(
    "/uploads/kit-assets",
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("X-Content-Type-Options", "nosniff");
      next();
    },
    express.static(resolve(uploadDir, "kit-assets"), { index: false, dotfiles: "deny", immutable: true, maxAge: "365d", fallthrough: false }),
  );
  app.use("/uploads", express.static(uploadDir, { index: false, dotfiles: "deny", maxAge: "1h" }));
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
