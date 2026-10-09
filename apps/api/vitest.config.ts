import { defineConfig } from "vitest/config";
// Keep local acceptance bounded: parallel API workers exhausted host memory.
export default defineConfig({ test: { maxWorkers: 1, minWorkers: 1, fileParallelism: false } });
