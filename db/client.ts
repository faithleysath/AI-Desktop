import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./types";

export const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://edudesk:edudesk@127.0.0.1:54329/edudesk";

export const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export async function closeDatabase() {
  await db.destroy();
}
