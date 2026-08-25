const root = new URL("..", import.meta.url).pathname;
const ports = [3211, 3212] as const;
const children = ports.map((port) =>
  Bun.spawn([process.execPath, "server/index.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATABASE_POOL_SIZE: "3" },
    stdout: "pipe",
    stderr: "pipe",
  }),
);

async function waitForHealth(port: number) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
    } catch {
      // Process may still be starting.
    }
    await Bun.sleep(100);
  }
  throw new Error(`instance ${port} failed to start`);
}

let socket: WebSocket | undefined;
try {
  await Promise.all(ports.map(waitForHealth));
  const login = await fetch(`http://127.0.0.1:${ports[0]}/api/session/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "teacher", password: "teacher123" }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("login did not set a session cookie");

  const title = `two-instance-${crypto.randomUUID()}`;
  const WebSocketWithHeaders = WebSocket as unknown as {
    new (url: string, options?: Bun.WebSocketOptions): WebSocket;
  };
  socket = new WebSocketWithHeaders(`ws://127.0.0.1:${ports[1]}/api/realtime`, {
    headers: { cookie },
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("websocket did not open")), 5_000);
    socket?.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket?.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("websocket error"));
      },
      { once: true },
    );
  });

  const eventPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("cross-instance event timed out")), 8_000);
    socket?.addEventListener("message", (message) => {
      const value = JSON.parse(String(message.data)) as {
        type?: string;
        data?: Record<string, unknown>;
      };
      if (value.type === "announcement.created" && value.data?.title === title) {
        clearTimeout(timeout);
        resolve(value);
      }
    });
  });
  const publish = await fetch(`http://127.0.0.1:${ports[0]}/api/messages`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ title, content: "published on instance one" }),
  });
  if (publish.status !== 201) throw new Error(`publish failed: ${publish.status}`);
  const event = await eventPromise;
  console.log(`Cross-instance realtime passed: ${String(event.type)}`);
} finally {
  socket?.close();
  for (const child of children) child.kill();
  await Promise.all(children.map((child) => child.exited));
}
