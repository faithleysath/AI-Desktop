import { betterAuth } from "better-auth";
import { createAccessControl } from "better-auth/plugins/access";
import { organization } from "better-auth/plugins/organization";
import { username } from "better-auth/plugins/username";
import { pool } from "../db/client";

const statements = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  exam: ["create", "read", "update", "delete", "publish", "submit", "grade"],
  announcement: ["create", "read", "delete"],
  file: ["create", "read", "delete"],
  settings: ["read", "update"],
} as const;

export const accessControl = createAccessControl(statements);
export const adminRole = accessControl.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  exam: ["create", "read", "update", "delete", "publish", "submit", "grade"],
  announcement: ["create", "read", "delete"],
  file: ["create", "read", "delete"],
  settings: ["read", "update"],
});
export const teacherRole = accessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  exam: ["create", "read", "update", "delete", "publish", "grade"],
  announcement: ["create", "read"],
  file: ["create", "read", "delete"],
  settings: ["read", "update"],
});
export const studentRole = accessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  exam: ["read", "submit"],
  announcement: ["read"],
  file: ["create", "read", "delete"],
  settings: ["read", "update"],
});

export const auth = betterAuth({
  appName: "EduDesk",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "edudesk-local-development-secret-change-me-at-least-32-chars",
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    password: {
      hash: (password) => Bun.password.hash(password, "argon2id"),
      verify: ({ hash, password }) => Bun.password.verify(password, hash),
    },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 32,
      displayUsername: false,
    }),
    organization({
      ac: accessControl,
      roles: { admin: adminRole, teacher: teacherRole, student: studentRole },
      creatorRole: "admin",
      allowUserToCreateOrganization: false,
    }),
  ],
  advanced: { database: { generateId: "uuid" }, cookiePrefix: "edudesk" },
});

export type Auth = typeof auth;
