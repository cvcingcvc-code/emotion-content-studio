import { type ZodType, ZodError } from "zod";
import { AppError } from "./errors.js";

function toFieldErrors(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    result[key] ??= [];
    result[key].push(issue.message);
  }

  return result;
}

export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "请求内容未通过校验",
      toFieldErrors(result.error),
    );
  }

  return result.data;
}
