import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>) {
  await sql`
    create table "user" (
      "id" uuid default pg_catalog.gen_random_uuid() primary key,
      "name" text not null,
      "email" text not null unique,
      "emailVerified" boolean not null default false,
      "image" text,
      "createdAt" timestamptz not null default current_timestamp,
      "updatedAt" timestamptz not null default current_timestamp,
      "username" text unique
    );
    create table "session" (
      "id" uuid default pg_catalog.gen_random_uuid() primary key,
      "expiresAt" timestamptz not null,
      "token" text not null unique,
      "createdAt" timestamptz not null default current_timestamp,
      "updatedAt" timestamptz not null default current_timestamp,
      "ipAddress" text,
      "userAgent" text,
      "userId" uuid not null references "user"("id") on delete cascade,
      "activeOrganizationId" text
    );
    create table "account" (
      "id" uuid default pg_catalog.gen_random_uuid() primary key,
      "issuer" text not null,
      "accountId" text not null,
      "providerId" text not null,
      "userId" uuid not null references "user"("id") on delete cascade,
      "accessToken" text,
      "refreshToken" text,
      "idToken" text,
      "accessTokenExpiresAt" timestamptz,
      "refreshTokenExpiresAt" timestamptz,
      "scope" text,
      "password" text,
      "createdAt" timestamptz not null default current_timestamp,
      "updatedAt" timestamptz not null default current_timestamp,
      unique ("issuer", "accountId")
    );
    create table "verification" (
      "id" uuid default pg_catalog.gen_random_uuid() primary key,
      "identifier" text not null,
      "value" text not null,
      "expiresAt" timestamptz not null,
      "createdAt" timestamptz not null default current_timestamp,
      "updatedAt" timestamptz not null default current_timestamp
    );
    create table "organization" (
      "id" uuid default pg_catalog.gen_random_uuid() primary key,
      "name" text not null,
      "slug" text not null unique,
      "logo" text,
      "createdAt" timestamptz not null default current_timestamp,
      "metadata" text
    );
    create table "member" (
      "id" uuid default pg_catalog.gen_random_uuid() primary key,
      "organizationId" uuid not null references "organization"("id") on delete cascade,
      "userId" uuid not null references "user"("id") on delete cascade,
      "role" text not null check ("role" in ('admin', 'teacher', 'student')),
      "createdAt" timestamptz not null default current_timestamp,
      unique ("organizationId", "userId")
    );
    create table "invitation" (
      "id" uuid default pg_catalog.gen_random_uuid() primary key,
      "organizationId" uuid not null references "organization"("id") on delete cascade,
      "email" text not null,
      "role" text,
      "status" text not null,
      "expiresAt" timestamptz not null,
      "createdAt" timestamptz not null default current_timestamp,
      "inviterId" uuid not null references "user"("id") on delete cascade
    );

    create table tenant_modules (
      id uuid default pg_catalog.gen_random_uuid() primary key,
      "organizationId" uuid not null references "organization"("id") on delete cascade,
      "moduleId" text not null,
      enabled boolean not null default true,
      "createdAt" timestamptz not null default current_timestamp,
      unique ("organizationId", "moduleId")
    );
    create table exams (
      id uuid default pg_catalog.gen_random_uuid() primary key,
      "organizationId" uuid not null references "organization"("id") on delete cascade,
      title text not null,
      "gradeLabel" text not null,
      subject text not null,
      status text not null default 'draft' check (status in ('draft', 'published')),
      "startAt" timestamptz not null,
      "endAt" timestamptz not null,
      "createdBy" uuid not null references "user"("id"),
      "createdAt" timestamptz not null default current_timestamp
    );
    create table questions (
      id uuid default pg_catalog.gen_random_uuid() primary key,
      "examId" uuid not null references exams(id) on delete cascade,
      idx integer not null,
      stem text not null,
      options jsonb not null,
      answer text not null check (answer in ('A', 'B', 'C', 'D')),
      score integer not null default 5 check (score > 0),
      unique ("examId", idx)
    );
    create table submissions (
      id uuid default pg_catalog.gen_random_uuid() primary key,
      "examId" uuid not null references exams(id) on delete cascade,
      "studentId" uuid not null references "user"("id"),
      answers jsonb not null,
      score integer not null,
      "totalScore" integer not null,
      "submittedAt" timestamptz not null default current_timestamp,
      unique ("examId", "studentId")
    );
    create table announcements (
      id uuid default pg_catalog.gen_random_uuid() primary key,
      "organizationId" uuid not null references "organization"("id") on delete cascade,
      "authorId" uuid not null references "user"("id"),
      title text not null,
      content text not null,
      "createdAt" timestamptz not null default current_timestamp
    );
    create table user_prefs (
      "userId" uuid primary key references "user"("id") on delete cascade,
      wallpaper integer not null default 0,
      "dockAutoHide" boolean not null default true,
      "updatedAt" timestamptz not null default current_timestamp
    );
    create table files (
      id uuid default pg_catalog.gen_random_uuid() primary key,
      "organizationId" uuid not null references "organization"("id") on delete cascade,
      "ownerId" uuid not null references "user"("id"),
      "objectKey" text not null unique,
      "originalName" text not null,
      "contentType" text not null,
      size bigint not null check (size >= 0),
      checksum text,
      etag text,
      status text not null default 'pending' check (status in ('pending', 'ready', 'rejected', 'deleted')),
      "createdAt" timestamptz not null default current_timestamp,
      "updatedAt" timestamptz not null default current_timestamp,
      "deletedAt" timestamptz
    );
    create table outbox_events (
      sequence bigserial primary key,
      id uuid not null default pg_catalog.gen_random_uuid() unique,
      "organizationId" uuid not null references "organization"("id") on delete cascade,
      "actorId" uuid not null references "user"("id"),
      type text not null,
      payload jsonb not null,
      "occurredAt" timestamptz not null default current_timestamp,
      "publishedAt" timestamptz,
      attempts integer not null default 0
    );

    create index "session_userId_idx" on "session"("userId");
    create index "account_userId_idx" on "account"("userId");
    create index "verification_identifier_idx" on "verification"(identifier);
    create index "member_organizationId_idx" on "member"("organizationId");
    create index "member_userId_idx" on "member"("userId");
    create index "invitation_organizationId_idx" on "invitation"("organizationId");
    create index "invitation_email_idx" on "invitation"(email);
    create index exams_organization_status_idx on exams("organizationId", status);
    create index announcements_organization_created_idx on announcements("organizationId", "createdAt" desc);
    create index files_organization_owner_idx on files("organizationId", "ownerId", status);
    create index outbox_org_sequence_idx on outbox_events("organizationId", sequence);
    create index outbox_pending_idx on outbox_events("publishedAt", sequence) where "publishedAt" is null;
  `.execute(db);
}

export async function down(db: Kysely<unknown>) {
  await sql`
    drop table if exists outbox_events;
    drop table if exists files;
    drop table if exists user_prefs;
    drop table if exists announcements;
    drop table if exists submissions;
    drop table if exists questions;
    drop table if exists exams;
    drop table if exists tenant_modules;
    drop table if exists invitation;
    drop table if exists member;
    drop table if exists organization;
    drop table if exists verification;
    drop table if exists account;
    drop table if exists session;
    drop table if exists "user";
  `.execute(db);
}
