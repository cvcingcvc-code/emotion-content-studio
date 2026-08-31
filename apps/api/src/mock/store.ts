import type { Draft, ExportRecord, Inspiration, Material, VideoProject } from "@emotion-studio/contracts";
import {
  mockDrafts,
  mockExports,
  mockInspirations,
  mockMaterials,
  mockVideoProjects,
} from "./data.js";

export interface MockStore {
  materials: Material[];
  inspirations: Inspiration[];
  drafts: Draft[];
  videoProjects: VideoProject[];
  exports: ExportRecord[];
}

export function createMockStore(): MockStore {
  return structuredClone({
    materials: mockMaterials,
    inspirations: mockInspirations,
    drafts: mockDrafts,
    videoProjects: mockVideoProjects,
    exports: mockExports,
  });
}
