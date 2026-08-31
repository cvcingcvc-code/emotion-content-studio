import {
  ApiErrorSchema,
  DraftSchema,
  ExportRecordSchema,
  MaterialSchema,
  VideoProjectSchema,
  createSuccessResponseSchema,
} from "@emotion-studio/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

async function createApp() {
  const app = await buildApp();
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("mock API", () => {
  it("returns a request id and mock health state", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe(body.requestId);
    expect(body.data).toEqual({ status: "ok", service: "emotion-studio-api", mode: "mock" });
  });

  it("serves exactly twenty newly authored material fixtures", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/materials" });
    const parsed = createSuccessResponseSchema(MaterialSchema.array()).parse(response.json());

    expect(parsed.data).toHaveLength(20);
    expect(new Set(parsed.data.map((item) => item.reviewStatus))).toEqual(
      new Set(["approved", "rejected", "needs_edit", "reference_only", "pending"]),
    );
    expect(JSON.stringify(parsed.data)).not.toContain("storageKey");
  });

  it("uses the unified validation error envelope", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/materials/material-18/review",
      payload: { decision: "rejected" },
    });
    const error = ApiErrorSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(error.error.code).toBe("VALIDATION_ERROR");
    expect(error.requestId).toBeTruthy();
  });

  it("prevents reference-only material from entering an approved state", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/materials/material-15/review",
      payload: { decision: "approved" },
    });
    const error = ApiErrorSchema.parse(response.json());

    expect(response.statusCode).toBe(409);
    expect(error.error.code).toBe("LICENSE_RESTRICTED");
  });

  it("confirms a safe AI draft only after explicit human acknowledgement", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/drafts/draft-01/confirm",
      payload: { humanConfirmed: true },
    });
    const parsed = createSuccessResponseSchema(DraftSchema).parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(parsed.data.status).toBe("confirmed");
    expect(parsed.data.confirmedAt).toBeTruthy();
  });

  it("creates a mock video project for the same confirmed draft", async () => {
    const app = await createApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/drafts/draft-01/confirm",
      payload: { humanConfirmed: true, text: "我把今天的停顿，留成一段可以继续阅读的空白。" },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/drafts/draft-01/video-project",
      payload: { templateKey: "blank_subtitle" },
    });
    const parsed = createSuccessResponseSchema(VideoProjectSchema).parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(parsed.data.draftId).toBe("draft-01");
    expect(parsed.data.templateKey).toBe("blank_subtitle");
  });

  it("retries a failed export as a simulation without creating a file URL", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/video-projects/video-03/simulated-export",
      payload: { acknowledgedRights: true },
    });
    const parsed = createSuccessResponseSchema(ExportRecordSchema).parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(parsed.data.status).toBe("processing");
    expect(parsed.data.downloadable).toBe(false);
    expect(JSON.stringify(parsed.data)).not.toContain("storageKey");
  });

  it("uses the unified envelope for unknown routes", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/not-real" });
    const error = ApiErrorSchema.parse(response.json());

    expect(response.statusCode).toBe(404);
    expect(error.error.code).toBe("NOT_FOUND");
  });
});
