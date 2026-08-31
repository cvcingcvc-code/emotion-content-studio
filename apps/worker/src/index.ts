import type { DatabaseContext } from "@emotion-studio/database";

export interface WorkerPlaceholder {
  status: "placeholder";
  databaseBoundary: "server-only";
  capabilities: readonly [];
}

export interface FutureWorkerDependencies {
  database?: DatabaseContext;
}

export function describeWorker(): WorkerPlaceholder {
  return {
    status: "placeholder",
    databaseBoundary: "server-only",
    capabilities: [],
  };
}
