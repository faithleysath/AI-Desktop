import type { ColumnType, Generated } from "kysely";

export type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
export type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;
export type Json<T> = ColumnType<T, T | string, T | string>;

export interface UserTable {
  id: string;
  name: string;
  email: string;
  emailVerified: Generated<boolean>;
  image: string | null;
  username: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SessionTable {
  id: string;
  expiresAt: Timestamp;
  token: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  ipAddress: string | null;
  userAgent: string | null;
  userId: string;
  activeOrganizationId: string | null;
}

export interface AccountTable {
  id: string;
  issuer: string;
  accountId: string;
  providerId: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: NullableTimestamp;
  refreshTokenExpiresAt: NullableTimestamp;
  scope: string | null;
  password: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VerificationTable {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OrganizationTable {
  id: Generated<string>;
  name: string;
  slug: string;
  logo: string | null;
  createdAt: Timestamp;
  metadata: string | null;
}

export interface MemberTable {
  id: string;
  organizationId: string;
  userId: string;
  role: "admin" | "teacher" | "student";
  createdAt: Timestamp;
}

export interface InvitationTable {
  id: string;
  organizationId: string;
  email: string;
  role: string | null;
  status: "pending" | "accepted" | "rejected" | "canceled";
  expiresAt: Timestamp;
  createdAt: Timestamp;
  inviterId: string;
}

export interface TenantModuleTable {
  id: Generated<string>;
  organizationId: string;
  moduleId: string;
  enabled: Generated<boolean>;
  createdAt: Timestamp;
}

export interface ExamTable {
  id: Generated<string>;
  organizationId: string;
  title: string;
  gradeLabel: string;
  subject: string;
  status: "draft" | "published";
  startAt: Timestamp;
  endAt: Timestamp;
  createdBy: string;
  createdAt: Timestamp;
}

export interface QuestionTable {
  id: Generated<string>;
  examId: string;
  idx: number;
  stem: string;
  options: Json<string[]>;
  answer: "A" | "B" | "C" | "D";
  score: Generated<number>;
}

export interface SubmissionTable {
  id: Generated<string>;
  examId: string;
  studentId: string;
  answers: Json<Record<string, "A" | "B" | "C" | "D">>;
  score: number;
  totalScore: number;
  submittedAt: Timestamp;
}

export interface AnnouncementTable {
  id: Generated<string>;
  organizationId: string;
  authorId: string;
  title: string;
  content: string;
  createdAt: Timestamp;
}

export interface UserPrefsTable {
  userId: string;
  wallpaper: Generated<number>;
  dockAutoHide: Generated<boolean>;
  updatedAt: Timestamp;
}

export interface FileTable {
  id: Generated<string>;
  organizationId: string;
  ownerId: string;
  objectKey: string;
  originalName: string;
  contentType: string;
  size: number;
  checksum: string | null;
  etag: string | null;
  status: "pending" | "ready" | "rejected" | "deleted";
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: NullableTimestamp;
}

export interface OutboxEventTable {
  sequence: Generated<string>;
  id: Generated<string>;
  organizationId: string;
  actorId: string;
  type: string;
  payload: Json<Record<string, unknown>>;
  occurredAt: Timestamp;
  publishedAt: NullableTimestamp;
  attempts: Generated<number>;
}

export interface Database {
  user: UserTable;
  session: SessionTable;
  account: AccountTable;
  verification: VerificationTable;
  organization: OrganizationTable;
  member: MemberTable;
  invitation: InvitationTable;
  tenant_modules: TenantModuleTable;
  exams: ExamTable;
  questions: QuestionTable;
  submissions: SubmissionTable;
  announcements: AnnouncementTable;
  user_prefs: UserPrefsTable;
  files: FileTable;
  outbox_events: OutboxEventTable;
}
