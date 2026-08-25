import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import type { Transaction } from "kysely";
import { z } from "zod";
import { APP_CATALOG } from "../contracts/apps";
import { db } from "../db/client";
import type { Database } from "../db/types";
import { auth } from "./auth";
import {
  type AccountContext,
  type AppEnv,
  accountFromHeaders,
  requireAccount,
  requireRoles,
} from "./context";
import {
  accountTopic,
  dispatchOutbox,
  enqueueEvent,
  examTopic,
  tenantTopic,
  wakeOutbox,
} from "./realtime";
import { buildObjectKey, objectStorage } from "./storage";

const optionSchema = z.enum(["A", "B", "C", "D"]);
const uuidParams = z.object({ id: z.uuid() });
const examParams = z.object({ examId: z.uuid() });

function notFound(message: string): never {
  throw new HTTPException(404, { message });
}

async function tenantExam(examId: string, organizationId: string) {
  const exam = await db
    .selectFrom("exams")
    .selectAll()
    .where("id", "=", examId)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();
  if (!exam) notFound("考试不存在");
  return exam;
}

async function insertEventTransaction<T>(
  account: AccountContext,
  type: Parameters<typeof enqueueEvent>[2],
  payload: Record<string, unknown>,
  mutate: (trx: Transaction<Database>) => Promise<T>,
) {
  const value = await db.transaction().execute(async (trx) => {
    const result = await mutate(trx);
    await enqueueEvent(trx, account, type, payload);
    return result;
  });
  wakeOutbox();
  return value;
}

export const api = new Hono<AppEnv>()
  .get("/health", (c) => c.json({ ok: true, runtime: `bun-${Bun.version}` }))
  .all("/auth/*", (c) => auth.handler(c.req.raw))
  .post(
    "/session/login",
    zValidator("json", z.object({ username: z.string().min(1), password: z.string().min(1) })),
    async (c) => {
      const body = c.req.valid("json");
      try {
        return await auth.api.signInUsername({
          body,
          headers: c.req.raw.headers,
          asResponse: true,
        });
      } catch {
        throw new HTTPException(401, { message: "用户名或密码错误" });
      }
    },
  )
  .post("/session/logout", requireAccount, (c) =>
    auth.api.signOut({ headers: c.req.raw.headers, asResponse: true }),
  )
  .get("/session/me", requireAccount, async (c) => {
    const account = c.get("account");
    const tenant = await db
      .selectFrom("organization")
      .select(["id", "name", "slug"])
      .where("id", "=", account.organizationId)
      .executeTakeFirstOrThrow();
    return c.json({ account, tenant });
  })
  .get("/dashboard/stats", requireAccount, async (c) => {
    const account = c.get("account");
    const [members, monthExamsRow, submissions, recent] = await Promise.all([
      db
        .selectFrom("member")
        .select(["role"])
        .where("organizationId", "=", account.organizationId)
        .execute(),
      db
        .selectFrom("exams")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("organizationId", "=", account.organizationId)
        .where("createdAt", ">=", new Date(new Date().getFullYear(), new Date().getMonth(), 1))
        .executeTakeFirstOrThrow(),
      db
        .selectFrom("submissions")
        .innerJoin("exams", "exams.id", "submissions.examId")
        .select(["submissions.submittedAt"])
        .where("exams.organizationId", "=", account.organizationId)
        .where("submissions.submittedAt", ">=", new Date(Date.now() - 13 * 86_400_000))
        .execute(),
      db
        .selectFrom("announcements")
        .innerJoin("user", "user.id", "announcements.authorId")
        .select([
          "announcements.id",
          "announcements.title",
          "announcements.content",
          "announcements.createdAt",
          "user.name as authorName",
        ])
        .where("announcements.organizationId", "=", account.organizationId)
        .orderBy("announcements.createdAt", "desc")
        .limit(3)
        .execute(),
    ]);
    let todoCount = 0;
    let todoLabel = "草稿考试待发布";
    if (account.role === "student") {
      const rows = await db
        .selectFrom("exams")
        .leftJoin("submissions", (join) =>
          join
            .onRef("submissions.examId", "=", "exams.id")
            .on("submissions.studentId", "=", account.id),
        )
        .select("exams.id")
        .where("exams.organizationId", "=", account.organizationId)
        .where("exams.status", "=", "published")
        .where("exams.endAt", ">=", new Date())
        .where("submissions.id", "is", null)
        .execute();
      todoCount = rows.length;
      todoLabel = "待参加考试";
    } else {
      const row = await db
        .selectFrom("exams")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("organizationId", "=", account.organizationId)
        .where("status", "=", "draft")
        .executeTakeFirstOrThrow();
      todoCount = Number(row.count);
    }
    const since = new Date();
    since.setDate(since.getDate() - 13);
    since.setHours(0, 0, 0, 0);
    const trend = Array<number>(14).fill(0);
    for (const submission of submissions) {
      const day = Math.floor((submission.submittedAt.getTime() - since.getTime()) / 86_400_000);
      if (day >= 0 && day < trend.length) trend[day] += 1;
    }
    return c.json({
      studentCount: members.filter((member) => member.role === "student").length,
      teacherCount: members.filter((member) => member.role === "teacher").length,
      monthExams: Number(monthExamsRow.count),
      todoCount,
      todoLabel,
      trend,
      recent,
    });
  })
  .get("/messages", requireAccount, async (c) => {
    const account = c.get("account");
    return c.json(
      await db
        .selectFrom("announcements")
        .innerJoin("user", "user.id", "announcements.authorId")
        .select([
          "announcements.id",
          "announcements.title",
          "announcements.content",
          "announcements.createdAt",
          "user.name as authorName",
        ])
        .where("announcements.organizationId", "=", account.organizationId)
        .orderBy("announcements.createdAt", "desc")
        .limit(50)
        .execute(),
    );
  })
  .post(
    "/messages",
    requireAccount,
    requireRoles("admin", "teacher"),
    zValidator("json", z.object({ title: z.string().min(1), content: z.string().min(1) })),
    async (c) => {
      const account = c.get("account");
      const body = c.req.valid("json");
      const announcement = await insertEventTransaction(
        account,
        "announcement.created",
        { title: body.title },
        async (trx) =>
          trx
            .insertInto("announcements")
            .values({
              organizationId: account.organizationId,
              authorId: account.id,
              ...body,
              createdAt: new Date(),
            })
            .returningAll()
            .executeTakeFirstOrThrow(),
      );
      return c.json(announcement, 201);
    },
  )
  .get("/system/apps", requireAccount, async (c) => {
    const account = c.get("account");
    const modules = await db
      .selectFrom("tenant_modules")
      .select(["moduleId", "enabled"])
      .where("organizationId", "=", account.organizationId)
      .execute();
    const enabled = new Map(modules.map((module) => [module.moduleId, module.enabled]));
    return c.json(
      APP_CATALOG.filter((app) => app.roles.includes(account.role) && enabled.get(app.id) === true),
    );
  })
  .get("/system/prefs", requireAccount, async (c) => {
    const prefs = await db
      .selectFrom("user_prefs")
      .selectAll()
      .where("userId", "=", c.get("account").id)
      .executeTakeFirst();
    return c.json({
      wallpaper: prefs?.wallpaper ?? 0,
      dockAutoHide: prefs?.dockAutoHide ?? true,
    });
  })
  .put(
    "/system/prefs",
    requireAccount,
    zValidator(
      "json",
      z.object({
        wallpaper: z.number().int().min(0).max(2).optional(),
        dockAutoHide: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const account = c.get("account");
      const body = c.req.valid("json");
      await insertEventTransaction(account, "prefs.updated", body, async (trx) => {
        await trx
          .insertInto("user_prefs")
          .values({
            userId: account.id,
            wallpaper: body.wallpaper ?? 0,
            dockAutoHide: body.dockAutoHide ?? true,
            updatedAt: new Date(),
          })
          .onConflict((oc) => oc.column("userId").doUpdateSet({ ...body, updatedAt: new Date() }))
          .execute();
      });
      return c.json({ success: true });
    },
  )
  .get("/system/modules", requireAccount, requireRoles("admin"), async (c) => {
    const account = c.get("account");
    const rows = await db
      .selectFrom("tenant_modules")
      .selectAll()
      .where("organizationId", "=", account.organizationId)
      .execute();
    const enabled = new Map(rows.map((row) => [row.moduleId, row.enabled]));
    return c.json(
      APP_CATALOG.map((app) => ({
        ...app,
        enabled: enabled.get(app.id) ?? false,
      })),
    );
  })
  .put(
    "/system/modules/:id",
    requireAccount,
    requireRoles("admin"),
    zValidator("param", z.object({ id: z.string().min(1) })),
    zValidator("json", z.object({ enabled: z.boolean() })),
    async (c) => {
      const account = c.get("account");
      const moduleId = c.req.valid("param").id;
      const { enabled } = c.req.valid("json");
      if (moduleId === "settings" && !enabled)
        throw new HTTPException(400, {
          message: "系统设置为基础模块，不可关闭",
        });
      if (!APP_CATALOG.some((app) => app.id === moduleId)) notFound("模块不存在");
      await insertEventTransaction(
        account,
        "module.updated",
        { moduleId, enabled },
        async (trx) => {
          await trx
            .insertInto("tenant_modules")
            .values({
              organizationId: account.organizationId,
              moduleId,
              enabled,
              createdAt: new Date(),
            })
            .onConflict((oc) => oc.columns(["organizationId", "moduleId"]).doUpdateSet({ enabled }))
            .execute();
        },
      );
      return c.json({ success: true });
    },
  )
  .get("/system/accounts", requireAccount, requireRoles("admin"), async (c) => {
    const account = c.get("account");
    return c.json(
      await db
        .selectFrom("member")
        .innerJoin("user", "user.id", "member.userId")
        .select(["user.id", "user.username", "user.name", "member.role", "user.createdAt"])
        .where("member.organizationId", "=", account.organizationId)
        .orderBy("user.createdAt", "asc")
        .execute(),
    );
  })
  .post(
    "/system/accounts",
    requireAccount,
    requireRoles("admin"),
    zValidator(
      "json",
      z.object({
        username: z
          .string()
          .min(3)
          .max(32)
          .regex(/^[a-zA-Z0-9_]+$/),
        password: z.string().min(8),
        name: z.string().min(1),
        role: z.enum(["admin", "teacher", "student"]),
      }),
    ),
    async (c) => {
      const account = c.get("account");
      const body = c.req.valid("json");
      if (
        await db
          .selectFrom("user")
          .select("id")
          .where("username", "=", body.username)
          .executeTakeFirst()
      ) {
        throw new HTTPException(409, { message: "用户名已存在" });
      }
      const signup = await auth.api.signUpEmail({
        body: { ...body, email: `${body.username}@edudesk.local` },
      });
      const userId = signup.user.id;
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("member")
          .values({
            id: crypto.randomUUID(),
            organizationId: account.organizationId,
            userId,
            role: body.role,
            createdAt: new Date(),
          })
          .execute();
        await enqueueEvent(trx, account, "account.created", {
          userId,
          username: body.username,
          role: body.role,
        });
      });
      wakeOutbox();
      return c.json({ success: true, id: userId }, 201);
    },
  )
  .get("/exams", requireAccount, async (c) => {
    const account = c.get("account");
    const [exams, questionCounts, submissionCounts, mine] = await Promise.all([
      db
        .selectFrom("exams")
        .selectAll()
        .where("organizationId", "=", account.organizationId)
        .orderBy("createdAt", "desc")
        .execute(),
      db
        .selectFrom("questions")
        .select(["examId"])
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .groupBy("examId")
        .execute(),
      db
        .selectFrom("submissions")
        .select(["examId"])
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .groupBy("examId")
        .execute(),
      account.role === "student"
        ? db
            .selectFrom("submissions")
            .select(["examId", "score", "totalScore"])
            .where("studentId", "=", account.id)
            .execute()
        : Promise.resolve([]),
    ]);
    const qMap = new Map(questionCounts.map((row) => [row.examId, Number(row.count)]));
    const sMap = new Map(submissionCounts.map((row) => [row.examId, Number(row.count)]));
    const myMap = new Map(
      mine.map((row) => [row.examId, { score: row.score, totalScore: row.totalScore }]),
    );
    return c.json(
      exams
        .filter((exam) => account.role !== "student" || exam.status === "published")
        .map((exam) => ({
          ...exam,
          questionCount: qMap.get(exam.id) ?? 0,
          submissionCount: sMap.get(exam.id) ?? 0,
          my: myMap.get(exam.id) ?? null,
        })),
    );
  })
  .post(
    "/exams",
    requireAccount,
    requireRoles("admin", "teacher"),
    zValidator(
      "json",
      z.object({
        title: z.string().min(1),
        gradeLabel: z.string().min(1),
        subject: z.string().min(1),
        startAt: z.coerce.date(),
        endAt: z.coerce.date(),
      }),
    ),
    async (c) => {
      const account = c.get("account");
      const body = c.req.valid("json");
      if (body.endAt <= body.startAt)
        throw new HTTPException(400, { message: "结束时间必须晚于开始时间" });
      const exam = await db.transaction().execute(async (trx) => {
        const created = await trx
          .insertInto("exams")
          .values({
            organizationId: account.organizationId,
            ...body,
            status: "draft",
            createdBy: account.id,
            createdAt: new Date(),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await enqueueEvent(trx, account, "exam.created", {
          examId: created.id,
        });
        return created;
      });
      wakeOutbox();
      return c.json({ id: exam.id }, 201);
    },
  )
  .delete(
    "/exams/:id",
    requireAccount,
    requireRoles("admin", "teacher"),
    zValidator("param", uuidParams),
    async (c) => {
      const account = c.get("account");
      const { id } = c.req.valid("param");
      const exam = await tenantExam(id, account.organizationId);
      if (exam.status !== "draft")
        throw new HTTPException(400, { message: "已发布的考试不可删除" });
      await insertEventTransaction(account, "exam.deleted", { examId: id }, (trx) =>
        trx.deleteFrom("exams").where("id", "=", id).execute(),
      );
      return c.json({ success: true });
    },
  )
  .get(
    "/exams/:examId/questions",
    requireAccount,
    requireRoles("admin", "teacher"),
    zValidator("param", examParams),
    async (c) => {
      const account = c.get("account");
      const { examId } = c.req.valid("param");
      await tenantExam(examId, account.organizationId);
      return c.json(
        await db
          .selectFrom("questions")
          .selectAll()
          .where("examId", "=", examId)
          .orderBy("idx")
          .execute(),
      );
    },
  )
  .post(
    "/exams/:examId/questions",
    requireAccount,
    requireRoles("admin", "teacher"),
    zValidator("param", examParams),
    zValidator(
      "json",
      z.object({
        stem: z.string().min(1),
        options: z.array(z.string().min(1)).length(4),
        answer: optionSchema,
        score: z.number().int().min(1).max(100),
      }),
    ),
    async (c) => {
      const account = c.get("account");
      const { examId } = c.req.valid("param");
      const exam = await tenantExam(examId, account.organizationId);
      if (exam.status !== "draft")
        throw new HTTPException(400, { message: "已发布的考试不可再改题" });
      const body = c.req.valid("json");
      await insertEventTransaction(account, "exam.updated", { examId }, async (trx) => {
        const count = await trx
          .selectFrom("questions")
          .select((eb) => eb.fn.countAll<string>().as("count"))
          .where("examId", "=", examId)
          .executeTakeFirstOrThrow();
        await trx
          .insertInto("questions")
          .values({
            examId,
            ...body,
            options: JSON.stringify(body.options),
            idx: Number(count.count) + 1,
          })
          .execute();
      });
      return c.json({ success: true }, 201);
    },
  )
  .delete(
    "/questions/:id",
    requireAccount,
    requireRoles("admin", "teacher"),
    zValidator("param", uuidParams),
    async (c) => {
      const account = c.get("account");
      const { id } = c.req.valid("param");
      const question = await db
        .selectFrom("questions")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      if (!question) notFound("题目不存在");
      const exam = await tenantExam(question.examId, account.organizationId);
      if (exam.status !== "draft")
        throw new HTTPException(400, { message: "已发布的考试不可再改题" });
      await insertEventTransaction(account, "exam.updated", { examId: exam.id }, (trx) =>
        trx.deleteFrom("questions").where("id", "=", id).execute(),
      );
      return c.json({ success: true });
    },
  )
  .post(
    "/exams/:examId/publish",
    requireAccount,
    requireRoles("admin", "teacher"),
    zValidator("param", examParams),
    async (c) => {
      const account = c.get("account");
      const { examId } = c.req.valid("param");
      const exam = await tenantExam(examId, account.organizationId);
      if (exam.status !== "draft") throw new HTTPException(400, { message: "考试已发布" });
      const question = await db
        .selectFrom("questions")
        .select("id")
        .where("examId", "=", examId)
        .executeTakeFirst();
      if (!question) throw new HTTPException(400, { message: "请先至少添加一道题目" });
      await insertEventTransaction(account, "exam.published", { examId }, (trx) =>
        trx.updateTable("exams").set({ status: "published" }).where("id", "=", examId).execute(),
      );
      return c.json({ success: true });
    },
  )
  .get(
    "/exams/:examId/take",
    requireAccount,
    requireRoles("student"),
    zValidator("param", examParams),
    async (c) => {
      const account = c.get("account");
      const { examId } = c.req.valid("param");
      const exam = await tenantExam(examId, account.organizationId);
      if (exam.status !== "published") throw new HTTPException(400, { message: "考试尚未发布" });
      const now = new Date();
      if (now < exam.startAt) throw new HTTPException(400, { message: "考试尚未开始" });
      if (now > exam.endAt) throw new HTTPException(400, { message: "考试已结束" });
      if (
        await db
          .selectFrom("submissions")
          .select("id")
          .where("examId", "=", examId)
          .where("studentId", "=", account.id)
          .executeTakeFirst()
      )
        throw new HTTPException(409, { message: "你已提交过本场考试" });
      const questions = await db
        .selectFrom("questions")
        .select(["id", "idx", "stem", "options", "score"])
        .where("examId", "=", examId)
        .orderBy("idx")
        .execute();
      return c.json({ exam, questions });
    },
  )
  .post(
    "/exams/:examId/submit",
    requireAccount,
    requireRoles("student"),
    zValidator("param", examParams),
    zValidator("json", z.object({ answers: z.record(z.string(), optionSchema) })),
    async (c) => {
      const account = c.get("account");
      const { examId } = c.req.valid("param");
      const { answers } = c.req.valid("json");
      const exam = await tenantExam(examId, account.organizationId);
      if (exam.status !== "published" || new Date() > exam.endAt)
        throw new HTTPException(400, { message: "考试不可提交" });
      const questions = await db
        .selectFrom("questions")
        .selectAll()
        .where("examId", "=", examId)
        .execute();
      if (!questions.length) throw new HTTPException(400, { message: "本场考试没有题目" });
      let score = 0;
      let totalScore = 0;
      for (const question of questions) {
        totalScore += question.score;
        if (answers[question.id] === question.answer) score += question.score;
      }
      try {
        await db.transaction().execute(async (trx) => {
          await trx
            .insertInto("submissions")
            .values({
              examId,
              studentId: account.id,
              answers: JSON.stringify(answers),
              score,
              totalScore,
              submittedAt: new Date(),
            })
            .execute();
          await enqueueEvent(trx, account, "exam.submitted", {
            examId,
            score,
            totalScore,
          });
        });
      } catch (error) {
        if ((error as { code?: string }).code === "23505")
          throw new HTTPException(409, { message: "你已提交过本场考试" });
        throw error;
      }
      wakeOutbox();
      return c.json({ score, totalScore });
    },
  )
  .get(
    "/exams/:examId/results",
    requireAccount,
    requireRoles("admin", "teacher"),
    zValidator("param", examParams),
    async (c) => {
      const account = c.get("account");
      const { examId } = c.req.valid("param");
      const exam = await tenantExam(examId, account.organizationId);
      const rows = await db
        .selectFrom("submissions")
        .innerJoin("user", "user.id", "submissions.studentId")
        .select([
          "submissions.id",
          "submissions.score",
          "submissions.totalScore",
          "submissions.submittedAt",
          "user.name as studentName",
          "user.username as studentUsername",
        ])
        .where("submissions.examId", "=", examId)
        .orderBy("submissions.score", "desc")
        .execute();
      return c.json({ exam, rows });
    },
  )
  .get("/grades/mine", requireAccount, async (c) => {
    const account = c.get("account");
    const rows = await db
      .selectFrom("submissions")
      .innerJoin("exams", "exams.id", "submissions.examId")
      .select([
        "submissions.id",
        "submissions.score",
        "submissions.totalScore",
        "submissions.submittedAt",
        "exams.title as examTitle",
        "exams.subject",
        "exams.gradeLabel",
      ])
      .where("submissions.studentId", "=", account.id)
      .where("exams.organizationId", "=", account.organizationId)
      .orderBy("submissions.submittedAt", "desc")
      .execute();
    const avgPct = rows.length
      ? rows.reduce((sum, row) => sum + (row.totalScore ? row.score / row.totalScore : 0), 0) /
        rows.length
      : 0;
    return c.json({ rows, avgPct: Math.round(avgPct * 1000) / 10 });
  })
  .get(
    "/grades/exams/:examId",
    requireAccount,
    requireRoles("admin", "teacher"),
    zValidator("param", examParams),
    async (c) => {
      const account = c.get("account");
      const { examId } = c.req.valid("param");
      const exam = await tenantExam(examId, account.organizationId);
      const [submissions, questions] = await Promise.all([
        db.selectFrom("submissions").selectAll().where("examId", "=", examId).execute(),
        db
          .selectFrom("questions")
          .selectAll()
          .where("examId", "=", examId)
          .orderBy("idx")
          .execute(),
      ]);
      const count = submissions.length;
      const totalScore = questions.reduce((sum, question) => sum + question.score, 0);
      const avg = count
        ? submissions.reduce((sum, submission) => sum + submission.score, 0) / count
        : 0;
      const max = count ? Math.max(...submissions.map((submission) => submission.score)) : 0;
      const min = count ? Math.min(...submissions.map((submission) => submission.score)) : 0;
      const passRate =
        count && totalScore
          ? submissions.filter((submission) => submission.score >= totalScore * 0.6).length / count
          : 0;
      const buckets = [0, 0, 0, 0, 0];
      if (totalScore)
        for (const submission of submissions) {
          const pct = submission.score / totalScore;
          buckets[pct >= 0.9 ? 4 : pct >= 0.8 ? 3 : pct >= 0.7 ? 2 : pct >= 0.6 ? 1 : 0] += 1;
        }
      const perQuestion = questions.map((question) => ({
        idx: question.idx,
        stem: question.stem,
        accuracy: count
          ? submissions.filter(
              (submission) => submission.answers[String(question.id)] === question.answer,
            ).length / count
          : 0,
      }));
      return c.json({
        exam,
        count,
        totalScore,
        avg: Math.round(avg * 10) / 10,
        max,
        min,
        passRate: Math.round(passRate * 1000) / 10,
        buckets,
        perQuestion,
      });
    },
  )
  .get("/files", requireAccount, async (c) => {
    const account = c.get("account");
    let query = db
      .selectFrom("files")
      .selectAll()
      .where("organizationId", "=", account.organizationId)
      .where("status", "!=", "deleted");
    if (account.role !== "admin") query = query.where("ownerId", "=", account.id);
    return c.json(await query.orderBy("createdAt", "desc").execute());
  })
  .post(
    "/files/upload-url",
    requireAccount,
    zValidator(
      "json",
      z.object({
        originalName: z.string().min(1).max(255),
        contentType: z.string().min(1).max(255),
        size: z
          .number()
          .int()
          .min(0)
          .max(100 * 1024 * 1024),
      }),
    ),
    async (c) => {
      const account = c.get("account");
      const body = c.req.valid("json");
      const fileId = crypto.randomUUID();
      const objectKey = buildObjectKey(account.organizationId, fileId, body.originalName);
      const file = await insertEventTransaction(
        account,
        "file.upload-requested",
        { objectKey },
        (trx) =>
          trx
            .insertInto("files")
            .values({
              id: fileId,
              organizationId: account.organizationId,
              ownerId: account.id,
              objectKey,
              ...body,
              checksum: null,
              etag: null,
              status: "pending",
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
            })
            .returningAll()
            .executeTakeFirstOrThrow(),
      );
      return c.json(
        {
          file,
          uploadUrl: objectStorage.createUploadUrl(objectKey, body.contentType),
          expiresIn: 900,
        },
        201,
      );
    },
  )
  .post("/files/:id/complete", requireAccount, zValidator("param", uuidParams), async (c) => {
    const account = c.get("account");
    const { id } = c.req.valid("param");
    const file = await db
      .selectFrom("files")
      .selectAll()
      .where("id", "=", id)
      .where("organizationId", "=", account.organizationId)
      .executeTakeFirst();
    if (!file || (account.role !== "admin" && file.ownerId !== account.id)) notFound("文件不存在");
    const stat = await objectStorage.stat(file.objectKey);
    if (
      stat.size !== Number(file.size) ||
      (stat.contentType && stat.contentType !== file.contentType)
    ) {
      await db
        .updateTable("files")
        .set({ status: "rejected", updatedAt: new Date() })
        .where("id", "=", id)
        .execute();
      throw new HTTPException(409, {
        message: "对象大小或类型与上传申请不一致",
      });
    }
    const checksum = stat.etag?.replaceAll('"', "") ?? null;
    await insertEventTransaction(account, "file.ready", { fileId: id }, (trx) =>
      trx
        .updateTable("files")
        .set({
          status: "ready",
          checksum,
          etag: checksum,
          updatedAt: new Date(),
        })
        .where("id", "=", id)
        .execute(),
    );
    return c.json({ success: true });
  })
  .get("/files/:id/download-url", requireAccount, zValidator("param", uuidParams), async (c) => {
    const account = c.get("account");
    const file = await db
      .selectFrom("files")
      .selectAll()
      .where("id", "=", c.req.valid("param").id)
      .where("organizationId", "=", account.organizationId)
      .where("status", "=", "ready")
      .executeTakeFirst();
    if (!file || (account.role !== "admin" && file.ownerId !== account.id)) notFound("文件不存在");
    return c.json({
      downloadUrl: objectStorage.createDownloadUrl(file.objectKey),
      expiresIn: 300,
    });
  })
  .delete("/files/:id", requireAccount, zValidator("param", uuidParams), async (c) => {
    const account = c.get("account");
    const { id } = c.req.valid("param");
    const file = await db
      .selectFrom("files")
      .selectAll()
      .where("id", "=", id)
      .where("organizationId", "=", account.organizationId)
      .executeTakeFirst();
    if (!file || (account.role !== "admin" && file.ownerId !== account.id)) notFound("文件不存在");
    await insertEventTransaction(account, "file.deleted", { fileId: id }, (trx) =>
      trx
        .updateTable("files")
        .set({
          status: "deleted",
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where("id", "=", id)
        .execute(),
    );
    void objectStorage
      .delete(file.objectKey)
      .catch((error) => console.error("object cleanup deferred", error));
    return c.json({ success: true });
  })
  .get(
    "/realtime/events",
    requireAccount,
    zValidator("query", z.object({ after: z.coerce.number().int().min(0).default(0) })),
    async (c) => {
      const account = c.get("account");
      const rows = await db
        .selectFrom("outbox_events")
        .selectAll()
        .where("organizationId", "=", account.organizationId)
        .where("sequence", ">", String(c.req.valid("query").after))
        .orderBy("sequence")
        .limit(100)
        .execute();
      return c.json(
        rows.map((row) => ({
          v: 1 as const,
          sequence: String(row.sequence),
          id: row.id,
          organizationId: row.organizationId,
          actorId: row.actorId,
          type: row.type,
          data: row.payload,
          occurredAt: row.occurredAt.toISOString(),
        })),
      );
    },
  )
  .get(
    "/realtime",
    upgradeWebSocket(async (c) => {
      const account = await accountFromHeaders(c.req.raw.headers);
      if (!account) throw new HTTPException(401, { message: "请先登录" });
      const topics = [tenantTopic(account.organizationId), accountTopic(account.id)];
      const requestedExamId = c.req.query("examId");
      if (requestedExamId) {
        const exam = await db
          .selectFrom("exams")
          .select("id")
          .where("id", "=", requestedExamId)
          .where("organizationId", "=", account.organizationId)
          .executeTakeFirst();
        if (!exam) throw new HTTPException(403, { message: "无权订阅该考试" });
        topics.push(examTopic(exam.id));
      }
      return {
        onOpen(_event, ws) {
          for (const topic of topics) (ws.raw as Bun.ServerWebSocket<unknown>).subscribe(topic);
          ws.send(JSON.stringify({ type: "realtime.ready" }));
        },
        onClose(_event, ws) {
          for (const topic of topics) (ws.raw as Bun.ServerWebSocket<unknown>).unsubscribe(topic);
        },
      };
    }),
  );

export const app = new Hono().route("/api", api);

app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  console.error(error);
  return c.json({ message: "服务器内部错误" }, 500);
});

export type AppType = typeof app;

export async function flushOutboxForTests() {
  await dispatchOutbox();
}
