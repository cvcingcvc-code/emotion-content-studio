import { z } from "zod";

const ServerConfigSchema = z
  .object({
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    CONTENT_REPOSITORY: z.enum(["database", "memory"]).default("memory"),
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
  });

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export function readServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  return ServerConfigSchema.parse(environment);
}
