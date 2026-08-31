import { z } from "zod";

const ServerConfigSchema = z.object({
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export function readServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  return ServerConfigSchema.parse(environment);
}
