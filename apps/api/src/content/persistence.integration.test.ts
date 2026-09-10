import { randomUUID } from "node:crypto";
import {
  ContentItemSchema,
  GeneratedContentSchema,
  createSuccessResponseSchema,
} from "@emotion-studio/contracts";
import {
  createDatabase,
  runMigrations,
  type DatabaseContext,
} from "@emotion-studio/database";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { DatabaseContentRepository } from "./database-repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationIt = testDatabaseUrl ? it : it.skip;

describe("persistent application restart", () => {
  integrationIt("keeps imported items, favorites, and generated drafts after restart", async () => {
    const schemaName = `restart_test_${randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool({ connectionString: testDatabaseUrl! });
    let firstDatabase: DatabaseContext | undefined;
    let secondDatabase: DatabaseContext | undefined;
    let firstApp: FastifyInstance | undefined;
    let secondApp: FastifyInstance | undefined;

    try {
      await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
      firstDatabase = createDatabase(testDatabaseUrl!, { searchPath: schemaName });
      expect((await runMigrations(firstDatabase.pool)).map((migration) => migration.name))
        .toEqual([
  "0000_independent_prototype.sql",
  "0001_content_repository.sql",
  "0002_multi_account_foundation.sql",
  "0003_generation_observability.sql",
]);
      firstApp = await buildApp({
        contentRepository: new DatabaseContentRepository(firstDatabase.db),
        contentRepositoryMode: "database",
      });

      await firstApp.inject({ method: "POST", url: "/api/v1/demo-data/load" });
      const listResponse = await firstApp.inject({
        method: "GET",
        url: "/api/v1/content-items?sort=likes_desc",
      });
      const items = createSuccessResponseSchema(ContentItemSchema.array())
        .parse(listResponse.json()).data;
      const selected = items.slice(0, 2);
      expect(selected).toHaveLength(2);

      await firstApp.inject({
        method: "POST",
        url: `/api/v1/content-items/${selected[0]!.id}/favorite`,
        payload: { favorite: true },
      });
      const generatedResponse = await firstApp.inject({
        method: "POST",
        url: "/api/v1/generated-contents",
        payload: { contentIds: selected.map((item) => item.id) },
      });
      const generated = createSuccessResponseSchema(GeneratedContentSchema)
        .parse(generatedResponse.json()).data;

      await firstApp.close();
      firstApp = undefined;
      await firstDatabase.close();
      firstDatabase = undefined;

      secondDatabase = createDatabase(testDatabaseUrl!, { searchPath: schemaName });
      expect(await runMigrations(secondDatabase.pool)).toEqual([]);
      secondApp = await buildApp({
        contentRepository: new DatabaseContentRepository(secondDatabase.db),
        contentRepositoryMode: "database",
      });

      const restartedItems = createSuccessResponseSchema(ContentItemSchema.array()).parse(
        (await secondApp.inject({ method: "GET", url: "/api/v1/content-items" })).json(),
      ).data;
      const restartedFavorites = createSuccessResponseSchema(ContentItemSchema.array()).parse(
        (await secondApp.inject({ method: "GET", url: "/api/v1/favorites" })).json(),
      ).data;
      const restartedGenerated = createSuccessResponseSchema(GeneratedContentSchema).parse(
        (await secondApp.inject({
          method: "GET",
          url: `/api/v1/generated-contents/${generated.id}`,
        })).json(),
      ).data;

      expect(restartedItems).toHaveLength(40);
      expect(restartedFavorites.map((item) => item.id)).toEqual([selected[0]!.id]);
      expect(restartedGenerated).toEqual(generated);
    } finally {
      await firstApp?.close();
      await secondApp?.close();
      await firstDatabase?.close();
      await secondDatabase?.close();
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });
});
