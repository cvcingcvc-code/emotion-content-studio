import { describeWorker } from "./index.js";

const worker = describeWorker();

process.stdout.write(
  `${JSON.stringify({ service: "emotion-studio-worker", ...worker })}\n`,
);
