import { z } from "zod";

const OptionalSecretSchema = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const ServerConfigSchema = z
  .object({
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    CONTENT_REPOSITORY: z.enum(["database", "memory"]).default("memory"),
    AI_PROVIDER: z.enum(["mock", "deepseek"]).default("mock"),
    DEEPSEEK_API_KEY: OptionalSecretSchema,
    DEEPSEEK_MODEL: z.string().trim().min(1).max(100).default("deepseek-v4-flash"),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
    AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(3).default(3),
    DATABASE_URL: z
      .string()
      .refine(
        (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
        "DATABASE_URL must use the PostgreSQL protocol",
      )
      .optional(),
  })
  .superRefine((config, context) => {
    if (config.CONTENT_REPOSITORY === "database" && !config.DATABASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required when CONTENT_REPOSITORY=database",
      });
    }
    if (config.NODE_ENV === "production" && config.CONTENT_REPOSITORY === "memory") {
      context.addIssue({
        code: "custom",
        path: ["CONTENT_REPOSITORY"],
        message: "Production requires CONTENT_REPOSITORY=database",
      });
    }
    if (config.AI_PROVIDER === "deepseek" && !config.DEEPSEEK_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["DEEPSEEK_API_KEY"],
        message: "DEEPSEEK_API_KEY is required when AI_PROVIDER=deepseek",
      });
    }
  });

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export function readServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  return ServerConfigSchema.parse(environment);
}
