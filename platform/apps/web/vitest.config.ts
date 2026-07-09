import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // only pure logic lives here — component tests would need jsdom
    include: ["lib/**/*.spec.ts"],
  },
});
