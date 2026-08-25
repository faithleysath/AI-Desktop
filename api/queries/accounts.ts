import { getDb } from "./connection";
import { accounts } from "@db/schema";
import { eq } from "drizzle-orm";

export async function findAccountByUsername(username: string) {
  return getDb().query.accounts.findFirst({
    where: eq(accounts.username, username),
  });
}

export async function findAccountById(id: number) {
  return getDb().query.accounts.findFirst({ where: eq(accounts.id, id) });
}
