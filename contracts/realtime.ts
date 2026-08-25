import { z } from "zod";

export const eventTypeSchema = z.enum([
  "announcement.created",
  "exam.created",
  "exam.updated",
  "exam.published",
  "exam.deleted",
  "exam.submitted",
  "module.updated",
  "prefs.updated",
  "account.created",
  "file.upload-requested",
  "file.ready",
  "file.deleted",
]);

const envelope = z
  .object({
    v: z.literal(1),
    sequence: z.string(),
    id: z.uuid(),
    organizationId: z.uuid(),
    actorId: z.uuid(),
    occurredAt: z.string(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

export const realtimeEventSchema = z.discriminatedUnion("type", [
  envelope.extend({ type: z.literal("announcement.created") }),
  envelope.extend({ type: z.literal("exam.created") }),
  envelope.extend({ type: z.literal("exam.updated") }),
  envelope.extend({ type: z.literal("exam.published") }),
  envelope.extend({ type: z.literal("exam.deleted") }),
  envelope.extend({ type: z.literal("exam.submitted") }),
  envelope.extend({ type: z.literal("module.updated") }),
  envelope.extend({ type: z.literal("prefs.updated") }),
  envelope.extend({ type: z.literal("account.created") }),
  envelope.extend({ type: z.literal("file.upload-requested") }),
  envelope.extend({ type: z.literal("file.ready") }),
  envelope.extend({ type: z.literal("file.deleted") }),
]);

export type EventType = z.infer<typeof eventTypeSchema>;
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
