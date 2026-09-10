import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { RetrospectiveInputSchema, ContentAccountSchema, ContentTypeSchema, LoopWritingSchema, EnglishWritingSchema, MetricsInputSchema } from "@emotion-studio/contracts";
import { parseOrThrow } from "../validation.js";
import type { GrowthLoopService } from "./service.js";

export async function registerGrowthLoopRoutes(app: FastifyInstance, service: GrowthLoopService) {
  const base = "/api/v1/growth-loop";
  const ok = (requestId: string, data: unknown) => ({ ok: true, data, requestId });
  const idOf = (params: unknown) => parseOrThrow(z.object({ id: z.string().uuid() }), params).id;
  const revisionSchema = z.object({ revision: z.number().int().nonnegative() }).strict();
  app.get(base, async request => ok(request.id, await service.repository.snapshot()));
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
