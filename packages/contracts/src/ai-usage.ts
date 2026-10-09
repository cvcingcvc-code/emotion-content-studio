import { z } from "zod";
export const AiUsageSchema = z.object({
  id: z.string().uuid(), createdAt: z.iso.datetime(), provider: z.enum(["deepseek", "openai-compatible"]),
  model: z.string().min(1).max(100), outcome: z.enum(["success", "failure", "blocked"]),
  attempts: z.number().int().nonnegative().max(3), durationMs: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable(),
  estimatedCost: z.number().nonnegative().nullable(), currency: z.string().regex(/^[A-Z]{3}$/), errorCode: z.string().nullable(),
}).strict();
export type AiUsage = z.infer<typeof AiUsageSchema>;
