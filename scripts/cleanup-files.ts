import { closeDatabase } from "../db/client";
import { cleanupStaleFiles } from "../server/jobs";

const result = await cleanupStaleFiles();
console.log(`Cleaned ${result.cleaned}/${result.inspected} stale objects`);
await closeDatabase();
