import { db } from "../db/client";
import { objectStorage } from "./storage";

export async function cleanupStaleFiles() {
  const pendingCutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  const files = await db
    .selectFrom("files")
    .select(["id", "objectKey", "status"])
    .where((eb) =>
      eb.or([
        eb("status", "=", "deleted"),
        eb.and([eb("status", "=", "rejected"), eb("deletedAt", "is", null)]),
        eb.and([eb("status", "=", "pending"), eb("createdAt", "<", pendingCutoff)]),
      ]),
    )
    .limit(100)
    .execute();

  let cleaned = 0;
  for (const file of files) {
    try {
      await objectStorage.delete(file.objectKey);
      await db.deleteFrom("files").where("id", "=", file.id).execute();
      cleaned += 1;
    } catch (error) {
      console.error(`cleanup failed for ${file.id}`, error);
    }
  }
  return { cleaned, inspected: files.length };
}
