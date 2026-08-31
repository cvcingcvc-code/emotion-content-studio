import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  activityEvents,
  drafts,
  exportRecords,
  imports,
  inspirations,
  materials,
  reviews,
  videoProjects,
} from "./schema.js";

describe("database schema boundary", () => {
  it("keeps original materials, drafts, projects, and exports in separate tables", () => {
    expect([
      imports,
      materials,
      reviews,
      inspirations,
      drafts,
      videoProjects,
      exportRecords,
      activityEvents,
    ].map(getTableName)).toEqual([
      "imports",
      "materials",
      "reviews",
      "inspirations",
      "drafts",
      "video_projects",
      "export_records",
      "activity_events",
    ]);
  });
});
