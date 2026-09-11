import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { RetrospectiveInputSchema, ContentAccountSchema, ContentTypeSchema, LoopWritingSchema, EnglishWritingSchema, MetricsInputSchema, PublishedContentSchema, growthCardPages } from "@emotion-studio/contracts";
import { parseOrThrow } from "../validation.js";
import type { GrowthLoopService } from "./service.js";
import { analyzePerformance } from "./feedback.js";
import { latestMetrics } from "./metrics.js";
import { dashboard } from "./dashboard.js";
import { AppError } from "../errors.js";
import { renderGrowthCard } from "./cards.js";
import { seedGrowthLoopDemo } from "./demo.js";

export async function registerGrowthLoopRoutes(app: FastifyInstance, service: GrowthLoopService) {
  const base = "/api/v1/growth-loop";
  const ok = (requestId: string, data: unknown) => ({ ok: true, data, requestId });
  const idOf = (params: unknown) => parseOrThrow(z.object({ id: z.string().uuid() }), params).id;
  const revisionSchema = z.object({ revision: z.number().int().nonnegative() }).strict();
  let rendering = false;
  let seeding = false;
  app.post(base + "/demo", async request => {
    if (seeding) throw new AppError(429, "DEMO_BUSY", "正在加载演示数据");
    seeding = true;
    try { return ok(request.id, await seedGrowthLoopDemo(service.repository)); }
    finally { seeding = false; }
  });
  app.post(base + "/preview/png", async (request, reply) => {
    const input = parseOrThrow(z.object({ content: PublishedContentSchema, page: z.number().int().min(1) }).strict(), request.body);
    if (input.page > growthCardPages(input.content).length) throw new AppError(400, "INVALID_PAGE", "页码无效");
    if (rendering) throw new AppError(429, "RENDER_BUSY", "正在导出，请稍后再试");
    rendering = true;
    try {
      const bytes = await renderGrowthCard(input.content, input.page);
      reply.header("content-disposition", `attachment; filename="${input.content.account}-page-${input.page}.png"`);
      return reply.type("image/png").send(bytes);
    } catch {
      throw new AppError(422, "RENDER_ERROR", "PNG未导出。请缩短过长标题，或确认本机 Edge / Chromium 可用。");
    } finally { rendering = false; }
  });
  app.get(base, async request => ok(request.id, await service.repository.snapshot()));
  app.get(base + "/dashboard", async request => ok(request.id, dashboard(await service.repository.snapshot(), service.agent.mode, service.repository.mode)));
  app.post(base + "/contents/:id/analyze", async request => {
    const state = await service.repository.snapshot(), id = idOf(request.params);
    const content = state.contents.find(x => x.id === id), metric = latestMetrics(state).get(id);
    if (!content || !metric) throw new AppError(409, "METRICS_REQUIRED", "请先录入已发布内容的表现");
    const cached = state.feedback.find(x => x.contentId === id && x.metricsId === metric.id);
    if (cached) return ok(request.id, cached);
    const feedback = analyzePerformance(content, metric, state);
    await service.repository.addFeedback(feedback); return ok(request.id, feedback);
  });
  app.post(base + "/retrospectives", async request => ok(request.id, await service.createRetrospective(parseOrThrow(RetrospectiveInputSchema, request.body))));
  app.put(base + "/retrospectives/:id", async request => {
    const input = parseOrThrow(z.object({ revision: z.number().int().nonnegative(), input: RetrospectiveInputSchema }).strict(), request.body);
    return ok(request.id, await service.updateRetrospective(idOf(request.params), input.input, input.revision));
  });
  app.post(base + "/retrospectives/:id/analyze", async request => ok(request.id, await service.analyze(idOf(request.params), parseOrThrow(revisionSchema, request.body).revision)));
  app.post(base + "/contents", async request => {
    const input = parseOrThrow(z.object({ account: ContentAccountSchema, topic: z.string().trim().min(1).max(120), contentType: ContentTypeSchema, sourceRetrospectiveId: z.string().uuid().nullable().default(null), sourceContentId: z.string().uuid().nullable().default(null) }).strict(), request.body);
    return ok(request.id, await service.createContent(input));
  });
  app.post(base + "/contents/:id/generate", async request => ok(request.id, await service.generate(idOf(request.params), parseOrThrow(revisionSchema, request.body).revision)));
  app.put(base + "/contents/:id/review", async request => {
    const input = parseOrThrow(z.object({ revision: z.number().int().nonnegative(), status: z.enum(["review", "ready"]), writing: LoopWritingSchema.nullable(), english: EnglishWritingSchema.nullable(), note: z.string().max(2000) }).strict(), request.body);
    return ok(request.id, await service.review(idOf(request.params), input));
  });
  app.post(base + "/contents/:id/publish", async request => {
    const input = parseOrThrow(z.object({ revision: z.number().int().nonnegative(), publishTime: z.iso.datetime() }).strict(), request.body);
    return ok(request.id, await service.publish(idOf(request.params), input.revision, input.publishTime));
  });
  app.post(base + "/contents/:id/metrics", async request => {
    const input = parseOrThrow(MetricsInputSchema, request.body);
    const value = { ...input, id: randomUUID(), contentId: idOf(request.params), capturedAt: new Date().toISOString() };
    await service.repository.addMetrics(value); return ok(request.id, value);
  });
}
