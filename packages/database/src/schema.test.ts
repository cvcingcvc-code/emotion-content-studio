import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  activityEvents,
  contentItems,
  drafts,
  exportRecords,
  imports,
  inspirations,
  materials,
  generatedContents,
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
      contentItems,
      generatedContents,
    ].map(getTableName)).toEqual([
      "imports",
      "materials",
      "reviews",
      "inspirations",
      "drafts",
      "video_projects",
      "export_records",
      "activity_events",
      "content_items",
      "generated_contents",
    ]);
  });
});
