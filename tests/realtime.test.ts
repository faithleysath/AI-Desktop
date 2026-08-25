import { describe, expect, test } from "bun:test";
import { realtimeEventSchema } from "../contracts/realtime";
import { buildObjectKey } from "../server/storage";

describe("cross-cutting contracts", () => {
  test("realtime messages are typed and reject client-defined channels", () => {
    const event = {
      v: 1,
      sequence: "42",
      id: crypto.randomUUID(),
      organizationId: crypto.randomUUID(),
      actorId: crypto.randomUUID(),
      type: "exam.published",
      data: { examId: crypto.randomUUID() },
      occurredAt: new Date().toISOString(),
    };
    expect(realtimeEventSchema.safeParse(event).success).toBe(true);
    expect(
      realtimeEventSchema.safeParse({
        ...event,
        channel: "admin",
        type: "client.subscribe",
      }).success,
    ).toBe(false);
  });

  test("object keys are tenant and owner isolated", () => {
    const organizationId = crypto.randomUUID();
    const ownerId = crypto.randomUUID();
    const key = buildObjectKey(organizationId, ownerId, "../../成绩 单.pdf");
    expect(key.startsWith(`tenants/${organizationId}/`)).toBe(true);
    expect(key).toContain(`/${ownerId}/`);
    expect(key).not.toContain("..");
    expect(key).not.toContain(" ");
  });
});
