import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    env: {
      DATABASE_URL: "postgresql://abhinaytiwari@localhost:5432/vriddhi_test?schema=public",
      // Fixed test-only secret so webhook signature tests don't depend on
      // a developer's local .env (and work in CI without one).
      RAZORPAY_WEBHOOK_SECRET: "test-only-webhook-secret-not-a-real-key",
    },
    fileParallelism: false, // shared test DB — tests truncate between runs, so files must not race
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
