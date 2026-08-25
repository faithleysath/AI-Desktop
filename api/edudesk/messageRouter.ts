import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { accounts, announcements } from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, accountQuery, teacherUpQuery } from "../middleware";

export const messageRouter = createRouter({
  list: accountQuery.query(async ({ ctx }) => {
    return getDb()
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        createdAt: announcements.createdAt,
        authorName: accounts.name,
      })
      .from(announcements)
      .innerJoin(accounts, eq(announcements.authorId, accounts.id))
      .where(eq(announcements.tenantId, ctx.account.tenantId))
      .orderBy(desc(announcements.createdAt))
      .limit(50);
  }),

  publish: teacherUpQuery
    .input(z.object({ title: z.string().min(1, "请填写标题"), content: z.string().min(1, "请填写内容") }))
    .mutation(async ({ ctx, input }) => {
      await getDb().insert(announcements).values({
        tenantId: ctx.account.tenantId,
        authorId: ctx.account.id,
        title: input.title,
        content: input.content,
      });
      return { success: true };
    }),
});
