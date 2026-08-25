import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { exams, questions, submissions } from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, accountQuery, teacherUpQuery } from "../middleware";
import { TRPCError } from "@trpc/server";

export const gradeRouter = createRouter({
  /** 某场考试的统计分析（教师视角） */
  examStats: teacherUpQuery
    .input(z.object({ examId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const exam = await db.query.exams.findFirst({
        where: and(eq(exams.id, input.examId), eq(exams.tenantId, ctx.account.tenantId)),
      });
      if (!exam) throw new TRPCError({ code: "NOT_FOUND", message: "考试不存在" });

      const subs = await db
        .select()
        .from(submissions)
        .where(eq(submissions.examId, input.examId));
      const qs = await db
        .select()
        .from(questions)
        .where(eq(questions.examId, input.examId))
        .orderBy(questions.idx);

      const n = subs.length;
      const avg = n ? subs.reduce((s, x) => s + x.score, 0) / n : 0;
      const max = n ? Math.max(...subs.map((x) => x.score)) : 0;
      const min = n ? Math.min(...subs.map((x) => x.score)) : 0;
      const total = qs.reduce((s, q) => s + q.score, 0);
      const passRate = n && total ? subs.filter((x) => x.score >= total * 0.6).length / n : 0;

      // 分数段分布（按满分百分比分 5 段）
      const buckets = [0, 0, 0, 0, 0];
      if (total > 0) {
        for (const s of subs) {
          const pct = s.score / total;
          const idx = pct >= 0.9 ? 4 : pct >= 0.8 ? 3 : pct >= 0.7 ? 2 : pct >= 0.6 ? 1 : 0;
          buckets[idx] += 1;
        }
      }

      // 每题正确率
      const perQuestion = qs.map((q) => {
        const correct = subs.filter((s) => s.answers[String(q.id)] === q.answer).length;
        return { idx: q.idx, stem: q.stem, accuracy: n ? correct / n : 0 };
      });

      return {
        exam,
        count: n,
        totalScore: total,
        avg: Math.round(avg * 10) / 10,
        max,
        min,
        passRate: Math.round(passRate * 1000) / 10,
        buckets,
        perQuestion,
      };
    }),

  /** 我的成绩（学生视角） */
  myGrades: accountQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select({
        id: submissions.id,
        score: submissions.score,
        totalScore: submissions.totalScore,
        submittedAt: submissions.submittedAt,
        examTitle: exams.title,
        subject: exams.subject,
        gradeLabel: exams.gradeLabel,
      })
      .from(submissions)
      .innerJoin(exams, eq(submissions.examId, exams.id))
      .where(
        and(
          eq(submissions.studentId, ctx.account.id),
          eq(exams.tenantId, ctx.account.tenantId),
        ),
      )
      .orderBy(desc(submissions.submittedAt));
    const avgPct = rows.length
      ? rows.reduce((s, r) => s + (r.totalScore ? r.score / r.totalScore : 0), 0) / rows.length
      : 0;
    return { rows, avgPct: Math.round(avgPct * 1000) / 10 };
  }),
});
