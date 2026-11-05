import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/repository.integration.ts"], testTimeout: 20000 },
});
