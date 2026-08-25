import type { Server } from "bun";
import type { Transaction } from "kysely";
import type { EventType, RealtimeEvent } from "../contracts/realtime";
import { db, pool } from "../db/client";
import type { Database } from "../db/types";
import type { AccountContext } from "./context";

let bunServer: Server<unknown> | undefined;
let dispatching = false;
let listenerStarted = false;

export function attachRealtimeServer(server: Server<unknown>) {
  bunServer = server;
}

export function tenantTopic(organizationId: string) {
  return `tenant:${organizationId}`;
}

export function accountTopic(accountId: string) {
  return `account:${accountId}`;
}

export function examTopic(examId: string) {
  return `exam:${examId}`;
}

export function submissionTopic(submissionId: string) {
  return `submission:${submissionId}`;
}

export async function enqueueEvent(
  trx: Transaction<Database>,
  account: AccountContext,
  type: EventType,
  payload: Record<string, unknown>,
) {
  return trx
    .insertInto("outbox_events")
    .values({
      organizationId: account.organizationId,
      actorId: account.id,
      type,
      payload: JSON.stringify(payload),
      occurredAt: new Date(),
      publishedAt: null,
    })
    .returning(["id", "sequence"])
    .executeTakeFirstOrThrow();
}

async function publishEventId(eventId: string) {
  const event = await db
    .selectFrom("outbox_events")
    .selectAll()
    .where("id", "=", eventId)
    .executeTakeFirst();
  if (!event || !bunServer) return;
  const message: RealtimeEvent = {
    v: 1,
    sequence: String(event.sequence),
    id: event.id,
    organizationId: event.organizationId,
    actorId: event.actorId,
    type: event.type as EventType,
    data: event.payload,
    occurredAt: event.occurredAt.toISOString(),
  };
  const body = JSON.stringify(message);
  const accountScoped = event.type === "prefs.updated" || event.type.startsWith("file.");
  bunServer.publish(
    accountScoped ? accountTopic(event.actorId) : tenantTopic(event.organizationId),
    body,
  );
  const examId = typeof event.payload.examId === "string" ? event.payload.examId : undefined;
  const submissionId =
    typeof event.payload.submissionId === "string" ? event.payload.submissionId : undefined;
  if (examId) bunServer.publish(examTopic(examId), body);
  if (submissionId) bunServer.publish(submissionTopic(submissionId), body);
}

export async function dispatchOutbox() {
  if (dispatching) return;
  dispatching = true;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query<{ id: string }>(
      'select id from outbox_events where "publishedAt" is null order by sequence for update skip locked limit 100',
    );
    for (const row of result.rows) {
      await client.query("select pg_notify('edudesk_events', $1)", [row.id]);
    }
    if (result.rows.length) {
      await client.query(
        'update outbox_events set "publishedAt" = now(), attempts = attempts + 1 where id = any($1::uuid[])',
        [result.rows.map((row) => row.id)],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    dispatching = false;
  }
}

export function wakeOutbox() {
  void dispatchOutbox().catch((error) => console.error("outbox dispatch failed", error));
}

export async function startRealtimeBridge() {
  if (listenerStarted) return;
  listenerStarted = true;
  const client = await pool.connect();
  client.on("notification", (message) => {
    if (message.channel === "edudesk_events" && message.payload) {
      void publishEventId(message.payload);
    }
  });
  client.on("error", (error) => console.error("realtime listener failed", error));
  await client.query("listen edudesk_events");
  setInterval(wakeOutbox, 500).unref();
  wakeOutbox();
}
