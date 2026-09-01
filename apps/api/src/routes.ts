import {
  ConfirmDraftInputSchema,
  CreateVideoProjectInputSchema,
  MaterialQuerySchema,
  ReviewMaterialInputSchema,
  SimulateExportInputSchema,
  type ApiSuccess,
  type Dashboard,
  type Draft,
  type ExportRecord,
  type Inspiration,
  type Material,
  type ReviewInbox,
  type VideoProject,
} from "@emotion-studio/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ContentAnalyzer } from "./content/analyzer.js";
import type { ContentGenerator } from "./content/generator.js";
import type { ContentRepository } from "./content/repository.js";
import { registerContentRoutes } from "./content/routes.js";
import { AppError } from "./errors.js";
import { mockDashboard } from "./mock/data.js";
import type { MockStore } from "./mock/store.js";
import { parseOrThrow } from "./validation.js";

function success<T>(request: FastifyRequest, data: T, total?: number): ApiSuccess<T> {
  return total === undefined
    ? { ok: true, data, requestId: request.id }
    : { ok: true, data, requestId: request.id, meta: { total } };
}

function getId(request: FastifyRequest): string {
  const params = request.params as { id?: unknown };
  if (typeof params.id !== "string" || params.id.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "缺少有效的资源标识");
  }
  return params.id;
}

function assertUsableLicense(licenseStatus: Material["licenseStatus"]): void {
  if (licenseStatus === "reference_only" || licenseStatus === "prohibited") {
    throw new AppError(409, "LICENSE_RESTRICTED", "当前授权状态不允许进入确认或导出流程");
  }
}

const templateNames: Record<VideoProject["templateKey"], string> = {
  blank_subtitle: "留白字幕",
  cinematic_monologue: "电影独白",
  night_mood: "夜色情绪",
};

export async function registerRoutes(
  app: FastifyInstance,
  store: MockStore,
  contentRepository: ContentRepository,
  contentAnalyzer: ContentAnalyzer,
  contentGenerator: ContentGenerator,
  contentRepositoryMode: "database" | "memory" | "custom",
): Promise<void> {
  await registerContentRoutes(app, contentRepository, contentAnalyzer, contentGenerator);
  app.get("/api/v1/health", async (request) =>
    success(request, {
      status: "ok" as const,
      service: "emotion-studio-api",
      mode: "mock" as const,
      repository: contentRepositoryMode,
    }),
  );

  app.get("/api/v1/dashboard", async (request): Promise<ApiSuccess<Dashboard>> => {
    const dashboard: Dashboard = {
      ...mockDashboard,
      metrics: {
        pendingReview: store.materials.filter((material) =>
          ["pending", "needs_edit"].includes(material.reviewStatus),
        ).length,
        inspirations: store.inspirations.length,
        drafts: store.drafts.filter((draft) => draft.status === "draft").length,
        exports: store.exports.filter((record) => record.status === "succeeded").length,
        targetExports: mockDashboard.metrics.targetExports,
      },
      recentInspirations: store.inspirations.slice(0, 3),
    };

    return success(request, dashboard);
  });

  app.get("/api/v1/materials", async (request): Promise<ApiSuccess<Material[]>> => {
    const query = parseOrThrow(MaterialQuerySchema, request.query);
    const search = query.search?.toLocaleLowerCase("zh-CN");
    const materials = store.materials.filter((material) => {
      if (query.reviewStatus && material.reviewStatus !== query.reviewStatus) return false;
      if (query.riskLevel && material.riskLevel !== query.riskLevel) return false;
      if (
        search &&
        !`${material.text} ${material.theme} ${material.scenario}`
          .toLocaleLowerCase("zh-CN")
          .includes(search)
      ) {
        return false;
      }
      return true;
    });

    return success(request, materials, materials.length);
  });

  app.get("/api/v1/review-inbox", async (request): Promise<ApiSuccess<ReviewInbox>> => {
    const items = store.materials.filter((material) =>
      ["pending", "needs_edit"].includes(material.reviewStatus),
    );
    const inbox: ReviewInbox = {
      items,
      counts: {
        pending: items.filter((material) => material.reviewStatus === "pending").length,
        highRisk: items.filter((material) =>
          ["high", "blocked"].includes(material.riskLevel),
        ).length,
        duplicates: items.filter((material) => material.filterFlags.includes("duplicate")).length,
        privacy: items.filter((material) => material.filterFlags.includes("privacy")).length,
      },
    };

    return success(request, inbox);
  });

  app.get("/api/v1/inspirations", async (request): Promise<ApiSuccess<Inspiration[]>> =>
    success(request, store.inspirations, store.inspirations.length),
  );

  app.get("/api/v1/drafts", async (request): Promise<ApiSuccess<Draft[]>> =>
    success(request, store.drafts, store.drafts.length),
  );

  app.get("/api/v1/video-projects", async (request): Promise<ApiSuccess<VideoProject[]>> =>
    success(request, store.videoProjects, store.videoProjects.length),
  );

  app.get("/api/v1/exports", async (request): Promise<ApiSuccess<ExportRecord[]>> =>
    success(request, store.exports, store.exports.length),
  );

  app.post("/api/v1/materials/:id/review", async (request): Promise<ApiSuccess<Material>> => {
    const material = store.materials.find((candidate) => candidate.id === getId(request));
    if (!material) {
      throw new AppError(404, "MATERIAL_NOT_FOUND", "未找到指定素材");
    }

    const input = parseOrThrow(ReviewMaterialInputSchema, request.body);
    if (material.licenseStatus === "prohibited") {
      throw new AppError(409, "LICENSE_PROHIBITED", "禁止使用的素材不能改变为可用状态");
    }
    if (material.licenseStatus === "reference_only" && input.decision !== "reference_only") {
      throw new AppError(409, "LICENSE_RESTRICTED", "仅研究素材只能保留在研究区");
    }

    material.reviewStatus = input.decision;
    return success(request, material);
  });

  app.post("/api/v1/drafts/:id/confirm", async (request): Promise<ApiSuccess<Draft>> => {
    const draft = store.drafts.find((candidate) => candidate.id === getId(request));
    if (!draft) {
      throw new AppError(404, "DRAFT_NOT_FOUND", "未找到指定草稿");
    }

    const input = parseOrThrow(ConfirmDraftInputSchema, request.body);
    const inspiration = store.inspirations.find(
      (candidate) => candidate.id === draft.inspirationId,
    );
    const material = inspiration
      ? store.materials.find((candidate) => candidate.id === inspiration.materialId)
      : undefined;

    if (!material) {
      throw new AppError(409, "SOURCE_MISSING", "草稿的来源素材不可用");
    }
    assertUsableLicense(material.licenseStatus);
    if (draft.safetyStatus !== "safe" || draft.similarityRisk >= 70) {
      throw new AppError(409, "DRAFT_REVIEW_REQUIRED", "草稿风险检查未通过，暂时不能确认");
    }

    if (input.text) draft.text = input.text;
    draft.status = "confirmed";
    draft.confirmedAt = new Date().toISOString();
    return success(request, draft);
  });

  app.post(
    "/api/v1/drafts/:id/video-project",
    async (request): Promise<ApiSuccess<VideoProject>> => {
      const draft = store.drafts.find((candidate) => candidate.id === getId(request));
      if (!draft) {
        throw new AppError(404, "DRAFT_NOT_FOUND", "未找到指定草稿");
      }
      if (draft.status !== "confirmed") {
        throw new AppError(409, "DRAFT_NOT_CONFIRMED", "只有人工确认后的文案才能创建视频项目");
      }

      const input = parseOrThrow(CreateVideoProjectInputSchema, request.body);
      const existing = store.videoProjects.find((candidate) => candidate.draftId === draft.id);
      if (existing) return success(request, existing);

      const inspiration = store.inspirations.find((candidate) => candidate.id === draft.inspirationId);
      const material = inspiration
        ? store.materials.find((candidate) => candidate.id === inspiration.materialId)
        : undefined;
      if (!inspiration || !material) {
        throw new AppError(409, "SOURCE_MISSING", "草稿的来源素材不可用");
      }
      assertUsableLicense(material.licenseStatus);

      const project: VideoProject = {
        id: `video-${String(store.videoProjects.length + 1).padStart(2, "0")}`,
        draftId: draft.id,
        title: inspiration.title,
        templateKey: input.templateKey,
        templateName: templateNames[input.templateKey],
        status: "preview_ready",
        durationSeconds: Math.max(12, Math.min(45, Math.round(draft.text.length / 4.5))),
        licenseStatus: material.licenseStatus,
        config: { alignment: "center", palette: "warm_white", pace: "slow" },
        updatedAt: new Date().toISOString(),
      };
      store.videoProjects.push(project);
      return success(request, project);
    },
  );

  app.post(
    "/api/v1/video-projects/:id/simulated-export",
    async (request): Promise<ApiSuccess<ExportRecord>> => {
      const project = store.videoProjects.find((candidate) => candidate.id === getId(request));
      if (!project) {
        throw new AppError(404, "VIDEO_PROJECT_NOT_FOUND", "未找到指定视频项目");
      }

      const input = parseOrThrow(SimulateExportInputSchema, request.body);
      assertUsableLicense(project.licenseStatus);

      const draft = store.drafts.find((candidate) => candidate.id === project.draftId);
      if (!draft || draft.status !== "confirmed") {
        throw new AppError(409, "DRAFT_NOT_CONFIRMED", "只有人工确认后的文案才能模拟导出");
      }

      if (input.templateKey) {
        project.templateKey = input.templateKey;
        project.templateName = templateNames[input.templateKey];
      }
      if (input.config) project.config = input.config;

      const existing = store.exports.find((record) => record.videoProjectId === project.id);

      const exportRecord: ExportRecord = existing ?? {
        id: `export-${String(store.exports.length + 1).padStart(2, "0")}`,
        videoProjectId: project.id,
        title: project.title,
        templateKey: project.templateKey,
        templateName: project.templateName,
        status: "processing",
        progress: 5,
        createdAt: new Date().toISOString(),
        completedAt: null,
        errorMessage: null,
        downloadable: false,
      };

      exportRecord.status = "processing";
      exportRecord.templateKey = project.templateKey;
      exportRecord.templateName = project.templateName;
      exportRecord.progress = 5;
      exportRecord.completedAt = null;
      exportRecord.errorMessage = null;
      exportRecord.downloadable = false;
      project.status = "exporting";
      project.updatedAt = new Date().toISOString();

      if (!existing) store.exports.push(exportRecord);
      return success(request, exportRecord);
    },
  );
}
