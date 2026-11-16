import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // only the pure logic we actually assert on
      include: [
        "src/orders/pricing.ts",
        "src/orders/status.ts",
        "src/market/commission.ts",
        "src/settings/settings.service.ts",
        "src/auth/guards/roles.guard.ts",
      ],
    },
  },
  esbuild: {
    // NestJS decorators
    target: "es2022",
  },
});
