import { describe, expect, it } from "vitest";
import { describeWorker } from "./index.js";

describe("worker placeholder", () => {
  it("does not claim queue, AI, CSV, or rendering capabilities", () => {
    expect(describeWorker()).toEqual({
      status: "placeholder",
      databaseBoundary: "server-only",
      capabilities: [],
    });
  });
});
