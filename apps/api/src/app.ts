import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { MockContentAnalyzer, type ContentAnalyzer } from "./content/analyzer.js";
import { MockContentGenerator, type ContentGenerator } from "./content/generator.js";
import {
  createContentRepository,
  type ContentRepository,
} from "./content/repository.js";
import { AppError } from "./errors.js";
import { createMockStore, type MockStore } from "./mock/store.js";
import { registerRoutes } from "./routes.js";

const DATABASE_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "08000",
  "08003",
  "08006",
  "53300",
  "57P01",
  "57P02",
  "57P03",
]);

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

export interface BuildAppOptions {
  logger?: boolean;
  webOrigin?: string;
  store?: MockStore;
  contentRepository?: ContentRepository;
  contentRepositoryMode?: "database" | "memory" | "custom";
  contentAnalyzer?: ContentAnalyzer;
  contentGenerator?: ContentGenerator;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 2_100_000 });
  const store = options.store ?? createMockStore();
  const contentRepository = options.contentRepository ?? createContentRepository({
    nodeEnv: process.env.NODE_ENV ?? "development",
  });
  const contentAnalyzer = options.contentAnalyzer ?? new MockContentAnalyzer();
  const contentGenerator = options.contentGenerator ?? new MockContentGenerator();

  await app.register(cors, {
    origin: options.webOrigin ?? "http://localhost:5173",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.setNotFoundHandler(async (request, reply) => {
    await reply.status(404).send({
      ok: false,
      error: { code: "NOT_FOUND", message: "未找到请求的接口" },
      requestId: request.id,
    });
  });

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AppError) {
      const details = error.fieldErrors ? { fieldErrors: error.fieldErrors } : {};
      await reply.status(error.statusCode).send({
        ok: false,
        error: { code: error.code, message: error.message, ...details },
        requestId: request.id,
      });
      return;
    }

    const errorCode = getErrorCode(error);
    if (errorCode && DATABASE_UNAVAILABLE_CODES.has(errorCode)) {
      request.log.error(
        { errorCode, requestId: request.id },
        "Content database unavailable",
      );
      await reply.status(503).send({
        ok: false,
        error: { code: "DATABASE_UNAVAILABLE", message: "内容数据库暂时不可用，请稍后重试" },
        requestId: request.id,
      });
      return;
    }

    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;

    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      await reply.status(statusCode).send({
        ok: false,
        error: { code: "BAD_REQUEST", message: "请求格式无效" },
        requestId: request.id,
      });
      return;
    }

    request.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError", requestId: request.id },
      "Unhandled mock API error",
    );
    await reply.status(500).send({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "服务暂时不可用" },
      requestId: request.id,
    });
  });

  await registerRoutes(
    app,
    store,
    contentRepository,
    contentAnalyzer,
    contentGenerator,
    options.contentRepositoryMode ?? (options.contentRepository ? "custom" : "memory"),
  );
  return app;
}
