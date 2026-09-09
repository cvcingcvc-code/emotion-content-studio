import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  activityEvents,
  accounts,
  contentItems,
  drafts,
  exportRecords,
  imports,
  inspirations,
  materials,
  generatedContents,
  postPerformances,
  postRecords,
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
      accounts,
      contentItems,
      generatedContents,
      postRecords,
      postPerformances,
    ].map(getTableName)).toEqual([
      "imports",
      "materials",
      "reviews",
      "inspirations",
      "drafts",
      "video_projects",
      "export_records",
      "activity_events",
      "accounts",
      "content_items",
      "generated_contents",
      "post_records",
      "post_performances",
    ]);
  });

  it("models account-scoped content without forcing emotion analysis on every lane", () => {
    const columns = getTableColumns(contentItems);

    expect(Object.keys(columns)).toEqual(expect.arrayContaining([
      "accountId",
      "sourceType",
      "contentLane",
      "originalContent",
      "cleanedContent",
      "sourcePlatform",
      "analysisKind",
      "analysisPayload",
      "analysisProvider",
      "analysisModel",
      "collectedAt",
    ]));
    expect(columns.accountId.notNull).toBe(true);
    expect(columns.emotion.notNull).toBe(false);
    expect(columns.emotionScore.notNull).toBe(false);
    expect(columns.resonanceScore.notNull).toBe(false);
    expect(columns.category.notNull).toBe(false);
  });

  it("keeps typed generated metadata and immutable publication snapshots separate", () => {
    const generatedColumns = getTableColumns(generatedContents);
    const postColumns = getTableColumns(postRecords);
    const performanceColumns = getTableColumns(postPerformances);

    expect(Object.keys(generatedColumns)).toEqual(expect.arrayContaining([
      "accountId",
      "contentLane",
      "outputKind",
      "outputPayload",
      "reviewIssues",
      "publishability",
      "confirmedAt",
    ]));
    expect(generatedColumns.outputPayload.notNull).toBe(false);
    expect(Object.keys(postColumns)).toEqual(expect.arrayContaining([
      "titleUsed",
      "bodyUsed",
      "hashtagsUsed",
      "publishedAt",
    ]));
    expect(Object.keys(performanceColumns)).toEqual(expect.arrayContaining([
      "views",
      "likes",
      "favorites",
      "comments",
      "shares",
      "follows",
      "metricsCapturedAt",
    ]));
  });

  it("enforces account ownership and one performance snapshot per publication", () => {
    const generatedConfig = getTableConfig(generatedContents);
    const postConfig = getTableConfig(postRecords);
    const performanceColumns = getTableColumns(postPerformances);
    const accountForeignKeys = [...generatedConfig.foreignKeys, ...postConfig.foreignKeys]
      .filter((key) => key.getName().endsWith("_account_fk"))
      .map((key) => {
        const reference = key.reference();
        return {
          columns: reference.columns.map((column) => column.name),
          target: getTableName(reference.foreignTable),
          targetColumns: reference.foreignColumns.map((column) => column.name),
        };
      });

    expect(accountForeignKeys).toEqual([
      { columns: ["primary_content_id", "account_id"], target: "content_items", targetColumns: ["id", "account_id"] },
      { columns: ["content_id", "account_id"], target: "content_items", targetColumns: ["id", "account_id"] },
      { columns: ["generated_content_id", "account_id"], target: "generated_contents", targetColumns: ["id", "account_id"] },
    ]);
    const generatedPostIndex = postConfig.indexes.find(
      (index) => index.config.name === "post_records_generated_content_unique",
    );
    expect(generatedPostIndex?.config.unique).toBe(true);
    expect(performanceColumns.postRecordId.primary).toBe(true);
    for (const name of ["views", "likes", "favorites", "comments", "shares", "follows"] as const) {
      expect(performanceColumns[name].notNull).toBe(false);
    }
  });
});
