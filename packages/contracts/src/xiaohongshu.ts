import { z } from "zod";
import { ContentTypeSchema, PublishedContentSchema } from "./growth-loop.js";

export const BatchContentItemSchema = z.object({
  account: z.enum(["growth", "emotion"]),
  topic: z.string().trim().min(1).max(120),
  contentType: ContentTypeSchema,
  sourceRetrospectiveId: z.string().uuid().nullable().default(null),
}).strict();
export const BatchGenerateInputSchema = z.object({ items: z.array(BatchContentItemSchema).min(1).max(10) }).strict();
export const BatchGenerateResultSchema = z.object({ results: z.array(z.object({
  index: z.number().int().nonnegative(),
  status: z.enum(["generated", "duplicate", "failed"]),
  content: PublishedContentSchema.nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
})) });
export const ContentTextExportInputSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), revision: z.number().int().nonnegative() }).strict()).min(1).max(50),
  format: z.enum(["text", "json"]),
}).strict();
export const ContentTextExportResultSchema = z.object({ filename: z.string(), mimeType: z.string(), content: z.string(), total: z.number().int().positive() });

/** Exact-topic deduplication; separate accounts, source experiences and formats stay separate. */
export function batchContentKey(item: { account: string; topic: string; contentType: string; sourceRetrospectiveId: string | null }) {
  return JSON.stringify([item.account, item.contentType, item.sourceRetrospectiveId, item.topic.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US")]);
}
export type BatchContentItem = z.infer<typeof BatchContentItemSchema>;
export type BatchGenerateResult = z.infer<typeof BatchGenerateResultSchema>;
