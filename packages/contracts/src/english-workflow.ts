import { z } from "zod";

export const ENGLISH_DEMO_TOPICS = ["尴尬时刻英语50句", "拒绝别人英语50句", "夸人英语50句"] as const;
export const ENGLISH_CANDIDATE_TOPICS = ["拍照英语50句", "点外卖英语50句", "朋友见面英语50句", "打工人下班英语50句", "手机聊天英语50句", "住酒店英语50句", "不会聊天时的英语50句"] as const;
export const EnglishToneSchema = z.enum(["日常", "搞笑", "治愈", "职场", "校园"]);
export const EnglishWorkflowInputSchema = z.object({
  topic: z.string().trim().min(2).max(60),
  tone: EnglishToneSchema.default("日常"),
}).strict();
export const EnglishLineSchema = z.object({
  number: z.number().int().min(1).max(50),
  english: z.string().trim().min(1).max(110).regex(/[a-z]/i),
  chinese: z.string().trim().min(1).max(55).regex(/[\u3400-\u9fff]/),
}).strict();
export const EnglishWritingSchema = z.object({
  topic: z.string().trim().min(2).max(60),
  tone: EnglishToneSchema,
  analysis: z.string().trim().min(1).max(400),
  groupNames: z.array(z.string().trim().min(1).max(24)).length(5),
  sentences: z.array(EnglishLineSchema).length(50),
  titles: z.array(z.string().trim().min(1).max(60)).length(5),
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(700),
  tags: z.array(z.string().trim().startsWith("#").max(30)).min(5).max(10),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.sentences.forEach((line, index) => {
    const text = line.english.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(text)) ctx.addIssue({ code: "custom", path: ["sentences", index, "english"], message: "英文句子重复" });
    seen.add(text);
    if (line.number !== index + 1) ctx.addIssue({ code: "custom", path: ["sentences", index, "number"], message: "编号必须连续为 1–50" });
    if (line.english.split(/\s+/).length > 20) ctx.addIssue({ code: "custom", path: ["sentences", index, "english"], message: "请缩短为不超过20词的口语句" });
  });
  if (new Set(value.titles).size !== 5) ctx.addIssue({ code: "custom", path: ["titles"], message: "需要五个不同候选标题" });
});
export const EnglishWorkflowDraftSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  revision: z.number().int().nonnegative(),
  generated_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  status: z.enum(["needs_revision", "approved"]),
  provider: z.enum(["demo", "deepseek"]),
  model: z.string(),
  writing: EnglishWritingSchema,
  output_path: z.string().nullable(),
}).strict();
export const EnglishHistoryEntrySchema = z.object({
  topic: z.string(),
  generated_at: z.string().datetime().nullable(),
  status: z.enum(["previously_generated", "needs_revision", "approved", "exported"]),
  output_path: z.string().nullable(),
  draft_id: z.string().nullable(),
}).strict();
export const EnglishHistorySchema = z.array(EnglishHistoryEntrySchema);
export const EnglishGenerateResultSchema = z.object({
  duplicate: z.boolean(),
  draft: EnglishWorkflowDraftSchema.nullable(),
  existing: EnglishHistoryEntrySchema.nullable(),
});
export const EnglishReviewInputSchema = z.object({
  revision: z.number().int().nonnegative(),
  writing: EnglishWritingSchema,
  status: z.enum(["needs_revision", "approved"]),
}).strict();
export const EnglishExportResultSchema = z.object({
  output_path: z.string(),
  files: z.array(z.object({ name: z.string(), url: z.string() })).length(7),
});
export const EnglishWorkflowInfoSchema = z.object({
  mode: z.enum(["demo", "real"]),
  history: EnglishHistorySchema,
});
export type EnglishWriting = z.infer<typeof EnglishWritingSchema>;
export type EnglishWorkflowDraft = z.infer<typeof EnglishWorkflowDraftSchema>;
export type EnglishHistoryEntry = z.infer<typeof EnglishHistoryEntrySchema>;
export type EnglishWorkflowInput = z.infer<typeof EnglishWorkflowInputSchema>;

/** Deterministic and free: punctuation/spacing/full-width digits do not bypass history. */
export function normalizeEnglishTopic(topic: string): string {
  return topic.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]/gu, "").replace(/五十/g, "50");
}
export function similarEnglishTopics(topic: string, history: readonly EnglishHistoryEntry[]): EnglishHistoryEntry[] {
  const normalized = normalizeEnglishTopic(topic);
  const key = normalized.replace(/(?:英语|英文|口语|表达|50句)/g, "");
  return history.filter((entry) => {
    const other = normalizeEnglishTopic(entry.topic);
    const base = other.replace(/(?:英语|英文|口语|表达|50句)/g, "");
    return other !== normalized && key.length >= 2 && base.length >= 2 && (base.includes(key) || key.includes(base));
  });
}
