import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { AiUsageSchema, type AiUsage } from "@emotion-studio/contracts";
export { AiUsageSchema, type AiUsage } from "@emotion-studio/contracts";
export type UsageRecorder = (entry: AiUsage) => void;
export function jsonlUsageRecorder(path: string): UsageRecorder {
  return entry => { mkdirSync(dirname(path), { recursive: true }); appendFileSync(path, JSON.stringify(AiUsageSchema.parse(entry)) + "\n", { encoding: "utf8", mode: 0o600 }); };
}
export function readAiUsage(path: string) {
  try { return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map(line => AiUsageSchema.parse(JSON.parse(line))).slice(-1000).reverse(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw new Error("AI usage ledger cannot be read"); }
}
export function usageId() { return randomUUID(); }
