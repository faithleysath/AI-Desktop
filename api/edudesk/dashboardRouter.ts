import { and, count, desc, eq, gte } from "drizzle-orm";
import { accounts, announcements, exams, submissions } from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, accountQuery } from "../middleware";

export const dashboardRouter = createRouter({
  stats: accountQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tid = ctx.account.tenantId;

    const [{ c: studentCount }] = await db
      .select({ c: count() })
      .from(accounts)
      .where(and(eq(accounts.tenantId, tid), eq(accounts.role, "student")));
    const [{ c: teacherCount }] = await db
      .select({ c: count() })
      .from(accounts)
      .where(and(eq(accounts.tenantId, tid), eq(accounts.role, "teacher")));

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [{ c: monthExams }] = await db
      .select({ c: count() })
      .from(exams)
      .where(and(eq(exams.tenantId, tid), gte(exams.createdAt, monthStart)));

    // 待办：学生 = 待参加考试数；教师/管理员 = 草稿考试数
    let todoCount = 0;
    let todoLabel = "";
    if (ctx.account.role === "student") {
      const publishedFull = await db
        .select()
        .from(exams)
        .where(and(eq(exams.tenantId, tid), eq(exams.status, "published")));
      const mine = await db
        .select({ examId: submissions.examId })
        .from(submissions)
        .where(eq(submissions.studentId, ctx.account.id));
      const done = new Set(mine.map((m) => m.examId));
      const now = Date.now();
      todoCount = publishedFull.filter(
        (e) => !done.has(e.id) && e.endAt.getTime() >= now,
      ).length;
      todoLabel = "待参加考试";
    } else {
      const [{ c: drafts }] = await db
        .select({ c: count() })
        .from(exams)
        .where(and(eq(exams.tenantId, tid), eq(exams.status, "draft")));
      todoCount = drafts;
      todoLabel = "草稿考试待发布";
    }

    // 近 14 日提交趋势
    const since = new Date(Date.now() - 13 * 86400000);
    since.setHours(0, 0, 0, 0);
    const subs = await db
      .select({ submittedAt: submissions.submittedAt })
      .from(submissions)
      .innerJoin(exams, eq(submissions.examId, exams.id))
      .where(and(eq(exams.tenantId, tid), gte(submissions.submittedAt, since)));
    const trend: number[] = Array(14).fill(0);
    const day0 = since.getTime();
    for (const s of subs) {
      const d = Math.floor((s.submittedAt.getTime() - day0) / 86400000);
      if (d >= 0 && d < 14) trend[d] += 1;
    }

    const recent = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        createdAt: announcements.createdAt,
        authorName: accounts.name,
      })
      .from(announcements)
      .innerJoin(accounts, eq(announcements.authorId, accounts.id))
      .where(eq(announcements.tenantId, tid))
      .orderBy(desc(announcements.createdAt))
      .limit(3);

    return {
      studentCount,
      teacherCount,
      monthExams,
      todoCount,
      todoLabel,
      trend,
      recent,
    };
  }),
});
