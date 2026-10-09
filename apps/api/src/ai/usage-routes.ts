import type { FastifyInstance } from "fastify";
import { AppError } from "../errors.js";
import { readAiUsage } from "./usage.js";
export function registerAiUsageRoutes(app: FastifyInstance, path?: string) {
  app.get("/api/v1/ai/usage", async request => {
    try { return { ok: true, data: path ? readAiUsage(path) : [], requestId: request.id }; }
    catch { throw new AppError(503, "AI_USAGE_STORAGE_ERROR", "调用记录无法读取，请检查本地存储。"); }
  });
}
