import { afterAll, describe, expect, test } from "bun:test";
import { closeDatabase, db } from "../db/client";
import { app } from "../server/app";
import { objectStorage } from "../server/storage";

async function login(username: "admin" | "teacher" | "student") {
  const response = await app.request("http://127.0.0.1:3000/api/session/login", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "bun-test" },
    body: JSON.stringify({ username, password: `${username}123` }),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error(`Login for ${username} did not return a session cookie`);
  return setCookie.split(";", 1)[0];
}

describe("Hono RPC API", () => {
  test("Better Auth username sessions resolve organization roles", async () => {
    for (const username of ["admin", "teacher", "student"] as const) {
      const cookie = await login(username);
      const response = await app.request("http://127.0.0.1:3000/api/session/me", {
        headers: { cookie },
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        account: { role: string; username: string };
        tenant: { slug: string };
      };
      expect(body.account).toMatchObject({ role: username, username });
      expect(body.tenant.slug).toBe("demo-school");
    }
  });

  test("Better Auth logout invalidates the server-side session", async () => {
    const cookie = await login("student");
    const logout = await app.request("http://127.0.0.1:3000/api/session/logout", {
      method: "POST",
      headers: { cookie },
    });
    expect(logout.status).toBe(200);
    const session = await app.request("http://127.0.0.1:3000/api/session/me", {
      headers: { cookie },
    });
    expect(session.status).toBe(401);
  });

  test("student cannot publish announcements or manage accounts", async () => {
    const cookie = await login("student");
    const publish = await app.request("http://127.0.0.1:3000/api/messages", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "forbidden", content: "forbidden" }),
    });
    expect(publish.status).toBe(403);
    const accounts = await app.request("http://127.0.0.1:3000/api/system/accounts", {
      headers: { cookie },
    });
    expect(accounts.status).toBe(403);
  });

  test("business mutation and outbox event commit atomically", async () => {
    const cookie = await login("teacher");
    const before = await db
      .selectFrom("outbox_events")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .executeTakeFirstOrThrow();
    const title = `outbox-${crypto.randomUUID()}`;
    const response = await app.request("http://127.0.0.1:3000/api/messages", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title, content: "transactional event" }),
    });
    expect(response.status).toBe(201);
    const after = await db
      .selectFrom("outbox_events")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .executeTakeFirstOrThrow();
    expect(Number(after.count)).toBe(Number(before.count) + 1);
    const event = await db
      .selectFrom("outbox_events")
      .selectAll()
      .orderBy("sequence", "desc")
      .executeTakeFirstOrThrow();
    expect(event.type).toBe("announcement.created");
    expect(event.payload.title).toBe(title);
  });

  test("native Bun S3 presigned upload and download round trip", async () => {
    const cookie = await login("admin");
    const content = `s3-${crypto.randomUUID()}`;
    const request = await app.request("http://127.0.0.1:3000/api/files/upload-url", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        originalName: "roundtrip.txt",
        contentType: "text/plain",
        size: new TextEncoder().encode(content).byteLength,
      }),
    });
    expect(request.status).toBe(201);
    const created = (await request.json()) as {
      file: { id: string; objectKey: string };
      uploadUrl: string;
    };
    expect(created.file.objectKey.split("/")).toHaveLength(6);
    expect(created.file.objectKey.startsWith("tenants/")).toBe(true);
    const upload = await fetch(created.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: content,
    });
    expect(upload.status).toBe(200);
    const complete = await app.request(
      `http://127.0.0.1:3000/api/files/${created.file.id}/complete`,
      {
        method: "POST",
        headers: { cookie },
      },
    );
    expect(complete.status).toBe(200);
    const downloadResponse = await app.request(
      `http://127.0.0.1:3000/api/files/${created.file.id}/download-url`,
      {
        headers: { cookie },
      },
    );
    expect(downloadResponse.status).toBe(200);
    const { downloadUrl } = (await downloadResponse.json()) as {
      downloadUrl: string;
    };
    expect(await (await fetch(downloadUrl)).text()).toBe(content);
    const remove = await app.request(`http://127.0.0.1:3000/api/files/${created.file.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(remove.status).toBe(200);
  });

  test("upload completion rejects object metadata mismatches", async () => {
    const cookie = await login("admin");
    const content = "short";
    const request = await app.request("http://127.0.0.1:3000/api/files/upload-url", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        originalName: "mismatch.txt",
        contentType: "text/plain",
        size: content.length + 10,
      }),
    });
    const created = (await request.json()) as {
      file: { id: string; objectKey: string };
      uploadUrl: string;
    };
    expect(
      (
        await fetch(created.uploadUrl, {
          method: "PUT",
          headers: { "content-type": "text/plain" },
          body: content,
        })
      ).status,
    ).toBe(200);
    const complete = await app.request(
      `http://127.0.0.1:3000/api/files/${created.file.id}/complete`,
      { method: "POST", headers: { cookie } },
    );
    expect(complete.status).toBe(409);
    expect(
      (
        await db
          .selectFrom("files")
          .select("status")
          .where("id", "=", created.file.id)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe("rejected");
    await objectStorage.delete(created.file.objectKey);
    await db.deleteFrom("files").where("id", "=", created.file.id).execute();
  });

  test("file routes do not cross organization boundaries", async () => {
    const cookie = await login("admin");
    const admin = await db
      .selectFrom("user")
      .select("id")
      .where("username", "=", "admin")
      .executeTakeFirstOrThrow();
    const organizationId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    await db
      .insertInto("organization")
      .values({
        id: organizationId,
        name: "隔离测试学校",
        slug: `isolation-${organizationId}`,
        logo: null,
        metadata: null,
        createdAt: new Date(),
      })
      .execute();
    await db
      .insertInto("files")
      .values({
        id: fileId,
        organizationId,
        ownerId: admin.id,
        objectKey: `tenants/${organizationId}/2026/08/${fileId}/secret.txt`,
        originalName: "secret.txt",
        contentType: "text/plain",
        size: 6,
        checksum: "private",
        etag: "private",
        status: "ready",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      })
      .execute();
    const response = await app.request(`http://127.0.0.1:3000/api/files/${fileId}/download-url`, {
      headers: { cookie },
    });
    expect(response.status).toBe(404);
    await db.deleteFrom("organization").where("id", "=", organizationId).execute();
  });
});

afterAll(async () => {
  await closeDatabase();
});
