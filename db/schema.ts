import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  boolean,
  int,
  json,
  unique,
} from "drizzle-orm/mysql-core";

/** 平台 OAuth 用户表（框架内置，暂未使用） */
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/* ==================== EduDesk 业务表 ==================== */

/** 学校租户 */
export const tenants = mysqlTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Tenant = typeof tenants.$inferSelect;

/** 校园账号（用户名密码登录，三种角色） */
export const accounts = mysqlTable("accounts", {
  id: serial("id").primaryKey(),
  tenantId: bigint("tenantId", { mode: "number", unsigned: true }).notNull(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "teacher", "student"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Account = typeof accounts.$inferSelect;

/** 租户模块授权（分模块售卖：哪个学校开了哪些应用） */
export const tenantModules = mysqlTable(
  "tenant_modules",
  {
    id: serial("id").primaryKey(),
    tenantId: bigint("tenantId", { mode: "number", unsigned: true }).notNull(),
    moduleId: varchar("moduleId", { length: 64 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
  },
  (t) => ({ uniq: unique("uniq_tenant_module").on(t.tenantId, t.moduleId) }),
);

/** 考试 */
export const exams = mysqlTable("exams", {
  id: serial("id").primaryKey(),
  tenantId: bigint("tenantId", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  gradeLabel: varchar("gradeLabel", { length: 64 }).notNull(),
  subject: varchar("subject", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["draft", "published"]).default("draft").notNull(),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  createdBy: bigint("createdBy", { mode: "number", unsigned: true }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Exam = typeof exams.$inferSelect;

/** 选择题（MVP 只支持单选） */
export const questions = mysqlTable("questions", {
  id: serial("id").primaryKey(),
  examId: bigint("examId", { mode: "number", unsigned: true }).notNull(),
  idx: int("idx").notNull(),
  stem: text("stem").notNull(),
  options: json("options").$type<string[]>().notNull(),
  answer: mysqlEnum("answer", ["A", "B", "C", "D"]).notNull(),
  score: int("score").default(5).notNull(),
});
export type Question = typeof questions.$inferSelect;

/** 答卷（学生提交，客观题自动评分） */
export const submissions = mysqlTable(
  "submissions",
  {
    id: serial("id").primaryKey(),
    examId: bigint("examId", { mode: "number", unsigned: true }).notNull(),
    studentId: bigint("studentId", { mode: "number", unsigned: true }).notNull(),
    answers: json("answers").$type<Record<string, "A" | "B" | "C" | "D">>().notNull(),
    score: int("score").notNull(),
    totalScore: int("totalScore").notNull(),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  },
  (t) => ({ uniq: unique("uniq_exam_student").on(t.examId, t.studentId) }),
);
export type Submission = typeof submissions.$inferSelect;

/** 校务公告 */
export const announcements = mysqlTable("announcements", {
  id: serial("id").primaryKey(),
  tenantId: bigint("tenantId", { mode: "number", unsigned: true }).notNull(),
  authorId: bigint("authorId", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Announcement = typeof announcements.$inferSelect;

/** 用户桌面偏好（壁纸 / 任务栏自动隐藏，随账号漫游） */
export const userPrefs = mysqlTable("user_prefs", {
  accountId: bigint("accountId", { mode: "number", unsigned: true }).primaryKey(),
  wallpaper: int("wallpaper").default(0).notNull(),
  dockAutoHide: boolean("dockAutoHide").default(true).notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
