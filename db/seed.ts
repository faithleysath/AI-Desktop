import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import { hashPassword } from "../api/edudesk/password";
import { APP_CATALOG } from "../contracts/apps";

const db = drizzle(process.env.DATABASE_URL!, { schema, mode: "planetscale" });

async function main() {
  console.log("🌱 Seeding EduDesk demo data...");

  // ---- 租户 ----
  let tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.name, "示范中学") });
  if (!tenant) {
    const [{ id }] = await db.insert(schema.tenants).values({ name: "示范中学" }).$returningId();
    tenant = (await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) }))!;
    console.log("  + tenant:", tenant.name);
  }
  const tid = tenant.id;

  // ---- 账号 ----
  const demoAccounts = [
    { username: "admin", password: "admin123", name: "王校管", role: "admin" as const },
    { username: "teacher", password: "teacher123", name: "李老师", role: "teacher" as const },
    { username: "student", password: "student123", name: "张同学", role: "student" as const },
  ];
  const accountIds: Record<string, number> = {};
  for (const a of demoAccounts) {
    const existing = await db.query.accounts.findFirst({ where: eq(schema.accounts.username, a.username) });
    if (existing) {
      accountIds[a.username] = existing.id;
      continue;
    }
    const [{ id }] = await db
      .insert(schema.accounts)
      .values({ tenantId: tid, username: a.username, passwordHash: hashPassword(a.password), name: a.name, role: a.role })
      .$returningId();
    accountIds[a.username] = id;
    console.log(`  + account: ${a.username} (${a.role})`);
  }

  // ---- 模块授权（全部启用）----
  for (const app of APP_CATALOG) {
    await db
      .insert(schema.tenantModules)
      .values({ tenantId: tid, moduleId: app.id, enabled: true })
      .onDuplicateKeyUpdate({ set: { enabled: true } });
  }
  console.log("  + modules licensed:", APP_CATALOG.map((a) => a.id).join(", "));

  // ---- 校务消息 ----
  const msgCount = await db.query.announcements.findMany({ where: eq(schema.announcements.tenantId, tid) });
  if (msgCount.length === 0) {
    await db.insert(schema.announcements).values([
      { tenantId: tid, authorId: accountIds["admin"], title: "欢迎使用 EduDesk 云桌面", content: "各位老师、同学：新一代校园云桌面已上线。所有应用集中在桌面中，按学校购买的模块开放。初始密码请登录后到「系统设置」中由管理员重置。" },
      { tenantId: tid, authorId: accountIds["teacher"], title: "期中考试安排通知", content: "本学期期中考试定于下周三至周五进行，请各任课老师提前在「考试测评」应用中录入试题并发布。学生登录后可直接在线作答。" },
      { tenantId: tid, authorId: accountIds["admin"], title: "关于机房设备维护的通知", content: "本周六上午 8:00-12:00 信息中心将对机房设备进行例行维护，期间云桌面可能短暂无法访问，请合理安排教学时间。" },
    ]);
    console.log("  + announcements: 3");
  }

  // ---- 示例考试（选择题）----
  let exam = await db.query.exams.findFirst({ where: and(eq(schema.exams.tenantId, tid), eq(schema.exams.title, "高一数学·函数基础测验")) });
  if (!exam) {
    const start = new Date();
    start.setDate(start.getDate() - 2);
    const end = new Date();
    end.setDate(end.getDate() + 7);
    const [{ id: examId }] = await db
      .insert(schema.exams)
      .values({ tenantId: tid, title: "高一数学·函数基础测验", gradeLabel: "高一(3)班", subject: "数学", status: "published", startAt: start, endAt: end, createdBy: accountIds["teacher"] })
      .$returningId();
    await db.insert(schema.questions).values([
      { examId, idx: 1, stem: "函数 f(x) = 2x + 1，则 f(3) 的值为？", options: ["5", "6", "7", "8"], answer: "C" as const, score: 20 },
      { examId, idx: 2, stem: "下列函数中，是奇函数的是？", options: ["f(x) = x²", "f(x) = x³", "f(x) = |x|", "f(x) = x + 1"], answer: "B" as const, score: 20 },
      { examId, idx: 3, stem: "一次函数 y = kx + b 的图象经过一、二、三象限，则？", options: ["k>0, b>0", "k>0, b<0", "k<0, b>0", "k<0, b<0"], answer: "A" as const, score: 20 },
      { examId, idx: 4, stem: "函数 y = √(x-1) 的定义域是？", options: ["x > 1", "x ≥ 1", "x < 1", "全体实数"], answer: "B" as const, score: 20 },
      { examId, idx: 5, stem: "已知 f(x) 是定义在 R 上的偶函数，且 f(2) = 3，则 f(-2) = ？", options: ["-3", "2", "3", "无法确定"], answer: "C" as const, score: 20 },
    ]);
    exam = (await db.query.exams.findFirst({ where: eq(schema.exams.id, examId) }))!;
    console.log("  + exam: 高一数学·函数基础测验 (5 questions)");
  }

  // ---- 示例提交 ----
  const sub = await db.query.submissions.findFirst({
    where: and(eq(schema.submissions.examId, exam.id), eq(schema.submissions.studentId, accountIds["student"])),
  });
  if (!sub) {
    // 答对 4 题：1C✓ 2B✓ 3A✓ 4A✗ 5C✓ = 80 分
    await db.insert(schema.submissions).values({
      examId: exam.id,
      studentId: accountIds["student"],
      answers: { "1": "C", "2": "B", "3": "A", "4": "A", "5": "C" },
      score: 80,
      totalScore: 100,
    });
    console.log("  + submission: student scored 80/100");
  }

  console.log("✅ Seed complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
