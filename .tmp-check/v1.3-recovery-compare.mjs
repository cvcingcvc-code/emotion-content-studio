import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const snapshots = process.argv.slice(2).map(path => JSON.parse(readFileSync(path, "utf8")));
assert.equal(snapshots.length, 3);
for (const snapshot of snapshots) {
  assert.equal(snapshot.checksum, createHash("sha256").update(JSON.stringify(snapshot.data)).digest("hex"));
  assert.deepEqual(snapshot.data, snapshots[0].data);
}
console.log(JSON.stringify({ result: "PASS", checks: ["snapshot checksums", "additive migration round-trip", "online backup restore round-trip"], sources: snapshots[0].data.items.length, generations: snapshots[0].data.generated.length, retrospectives: snapshots[0].data.growthLoop.retrospectives.length, contents: snapshots[0].data.growthLoop.contents.length }));
