import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { AppError } from "./errors.js";
import { createMockStore, type MockStore } from "./mock/store.js";
import { registerRoutes } from "./routes.js";

export interface BuildAppOptions {
  logger?: boolean;
  webOrigin?: string;
  store?: MockStore;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const store = options.store ?? createMockStore();

  await app.register(cors, {
    origin: options.webOrigin ?? "http://localhost:5173",
    methods: ["GET", "POST", "OPTIONS"],
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

  await registerRoutes(app, store);
  return app;
}
