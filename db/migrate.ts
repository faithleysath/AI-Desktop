import { promises as fs } from "node:fs";
import path from "node:path";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { closeDatabase, db } from "./client";

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder: path.join(import.meta.dir, "migrations"),
  }),
});

const direction = process.argv[2];
const result =
  direction === "down" ? await migrator.migrateDown() : await migrator.migrateToLatest();

for (const migration of result.results ?? []) {
  console.log(`${migration.status}: ${migration.migrationName}`);
}
if (result.error) {
  console.error(result.error);
  await closeDatabase();
  process.exit(1);
}
await closeDatabase();
