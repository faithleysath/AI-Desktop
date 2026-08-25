import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq } from "drizzle-orm";
import { accounts, exams, questions, submissions } from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, accountQuery, teacherUpQuery, studentQuery } from "../middleware";

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

async function getTenantExam(examId: number, tenantId: number) {
  const exam = await getDb().query.exams.findFirst({
    where: and(eq(exams.id, examId), eq(exams.tenantId, tenantId)),
  });
  if (!exam) throw new TRPCError({ code: "NOT_FOUND", message: "考试不存在" });
  return exam;
}

export const examRouter = createRouter({
  /** 考试列表（学生视角含自己的得分状态） */
  list: accountQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tid = ctx.account.tenantId;
    const rows = await db
      .select()
      .from(exams)
      .where(eq(exams.tenantId, tid))
      .orderBy(desc(exams.createdAt));

    const qCounts = await db
      .select({ examId: questions.examId, c: count() })
      .from(questions)
      .groupBy(questions.examId);
    const sCounts = await db
      .select({ examId: submissions.examId, c: count() })
      .from(submissions)
      .groupBy(submissions.examId);
    const qMap = new Map(qCounts.map((r) => [r.examId, r.c]));
    const sMap = new Map(sCounts.map((r) => [r.examId, r.c]));

    let mySubs = new Map<number, { score: number; totalScore: number }>();
    if (ctx.account.role === "student") {
      const mine = await db
        .select()
        .from(submissions)
        .where(eq(submissions.studentId, ctx.account.id));
      mySubs = new Map(mine.map((m) => [m.examId, { score: m.score, totalScore: m.totalScore }]));
    }

    return rows
      .filter((e) => ctx.account.role !== "student" || e.status === "published")
      .map((e) => ({
        ...e,
        questionCount: qMap.get(e.id) ?? 0,
        submissionCount: sMap.get(e.id) ?? 0,
        my: mySubs.get(e.id) ?? null,
      }));
  }),

  /** 创建考试（草稿） */
  create: teacherUpQuery
    .input(
      z.object({
        title: z.string().min(1, "请填写考试名称"),
        gradeLabel: z.string().min(1, "请填写年级"),
        subject: z.string().min(1, "请填写科目"),
        startAt: z.coerce.date(),
        endAt: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.endAt <= input.startAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "结束时间必须晚于开始时间" });
      }
      const [{ id }] = await getDb()
        .insert(exams)
        .values({
          tenantId: ctx.account.tenantId,
          title: input.title,
          gradeLabel: input.gradeLabel,
          subject: input.subject,
          startAt: input.startAt,
          endAt: input.endAt,
          createdBy: ctx.account.id,
        })
        .$returningId();
      return { id };
    }),

  /** 删除草稿考试 */
  remove: teacherUpQuery
    .input(z.object({ examId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const exam = await getTenantExam(input.examId, ctx.account.tenantId);
      if (exam.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "已发布的考试不可删除" });
      }
      const db = getDb();
      await db.delete(questions).where(eq(questions.examId, input.examId));
      await db.delete(exams).where(eq(exams.id, input.examId));
      return { success: true };
    }),

  /** 题目列表（教师视角，含答案） */
  questions: teacherUpQuery
    .input(z.object({ examId: z.number() }))
    .query(async ({ ctx, input }) => {
      await getTenantExam(input.examId, ctx.account.tenantId);
      return getDb()
        .select()
        .from(questions)
        .where(eq(questions.examId, input.examId))
        .orderBy(questions.idx);
    }),

  addQuestion: teacherUpQuery
    .input(
      z.object({
        examId: z.number(),
        stem: z.string().min(1, "请填写题干"),
        options: z.array(z.string().min(1, "选项不能为空")).length(4, "需要 4 个选项"),
        answer: z.enum(OPTION_KEYS),
        score: z.number().int().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const exam = await getTenantExam(input.examId, ctx.account.tenantId);
      if (exam.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "已发布的考试不可再改题" });
      }
      const db = getDb();
      const [{ c }] = await db
        .select({ c: count() })
        .from(questions)
        .where(eq(questions.examId, input.examId));
      await db.insert(questions).values({
        examId: input.examId,
        idx: c + 1,
        stem: input.stem,
        options: input.options,
        answer: input.answer,
        score: input.score,
      });
      return { success: true };
    }),

  removeQuestion: teacherUpQuery
    .input(z.object({ questionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const q = await db.query.questions.findFirst({
        where: eq(questions.id, input.questionId),
      });
      if (!q) throw new TRPCError({ code: "NOT_FOUND", message: "题目不存在" });
      const exam = await getTenantExam(q.examId, ctx.account.tenantId);
      if (exam.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "已发布的考试不可再改题" });
      }
      await db.delete(questions).where(eq(questions.id, input.questionId));
      return { success: true };
    }),

  /** 发布考试 */
  publish: teacherUpQuery
    .input(z.object({ examId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const exam = await getTenantExam(input.examId, ctx.account.tenantId);
      if (exam.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "考试已发布" });
      }
      const [{ c }] = await getDb()
        .select({ c: count() })
        .from(questions)
        .where(eq(questions.examId, input.examId));
      if (c === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "请先至少添加一道题目" });
      }
      await getDb()
        .update(exams)
        .set({ status: "published" })
        .where(eq(exams.id, input.examId));
      return { success: true };
    }),

  /** 学生取卷（不含答案） */
  take: studentQuery
    .input(z.object({ examId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const exam = await getTenantExam(input.examId, ctx.account.tenantId);
      if (exam.status !== "published") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "考试尚未发布" });
      }
      const now = Date.now();
      if (now < exam.startAt.getTime()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "考试尚未开始" });
      }
      if (now > exam.endAt.getTime()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "考试已结束" });
      }
      const existing = await db.query.submissions.findFirst({
        where: and(eq(submissions.examId, input.examId), eq(submissions.studentId, ctx.account.id)),
      });
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "你已提交过本场考试" });
      }
      const qs = await db
        .select({
          id: questions.id,
          idx: questions.idx,
          stem: questions.stem,
          options: questions.options,
          score: questions.score,
        })
        .from(questions)
        .where(eq(questions.examId, input.examId))
        .orderBy(questions.idx);
      return { exam, questions: qs };
    }),

  /** 学生交卷（客观题自动评分） */
  submit: studentQuery
    .input(
      z.object({
        examId: z.number(),
        answers: z.record(z.string(), z.enum(OPTION_KEYS)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const exam = await getTenantExam(input.examId, ctx.account.tenantId);
      if (exam.status !== "published") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "考试尚未发布" });
      }
      if (Date.now() > exam.endAt.getTime()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "考试已结束，无法提交" });
      }
      const qs = await db
        .select()
        .from(questions)
        .where(eq(questions.examId, input.examId));
      if (qs.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "本场考试没有题目" });
      }
      let score = 0;
      let totalScore = 0;
      for (const q of qs) {
        totalScore += q.score;
        if (input.answers[String(q.id)] === q.answer) score += q.score;
      }
      try {
        await db.insert(submissions).values({
          examId: input.examId,
          studentId: ctx.account.id,
          answers: input.answers,
          score,
          totalScore,
        });
      } catch {
        throw new TRPCError({ code: "CONFLICT", message: "你已提交过本场考试" });
      }
      return { score, totalScore };
    }),

  /** 答卷列表（教师视角） */
  results: teacherUpQuery
    .input(z.object({ examId: z.number() }))
    .query(async ({ ctx, input }) => {
      const exam = await getTenantExam(input.examId, ctx.account.tenantId);
      const rows = await getDb()
        .select({
          id: submissions.id,
          score: submissions.score,
          totalScore: submissions.totalScore,
          submittedAt: submissions.submittedAt,
          studentName: accounts.name,
          studentUsername: accounts.username,
        })
        .from(submissions)
        .innerJoin(accounts, eq(submissions.studentId, accounts.id))
        .where(eq(submissions.examId, input.examId))
        .orderBy(desc(submissions.score));
      return { exam, rows };
    }),
});
