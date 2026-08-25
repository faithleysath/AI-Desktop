import { APP_CATALOG, type Role } from "../contracts/apps";
import { auth } from "../server/auth";
import { closeDatabase, db } from "./client";

const demoAccounts: Array<{
  username: string;
  password: string;
  name: string;
  role: Role;
}> = [
  { username: "admin", password: "admin123", name: "王校管", role: "admin" },
  {
    username: "teacher",
    password: "teacher123",
    name: "李老师",
    role: "teacher",
  },
  {
    username: "student",
    password: "student123",
    name: "张同学",
    role: "student",
  },
];

async function ensureUser(account: (typeof demoAccounts)[number]) {
  const existing = await db
    .selectFrom("user")
    .selectAll()
    .where("username", "=", account.username)
    .executeTakeFirst();
  if (existing) return existing;

  await auth.api.signUpEmail({
    body: {
      name: account.name,
      email: `${account.username}@edudesk.local`,
      username: account.username,
      password: account.password,
    },
  });
  const created = await db
    .selectFrom("user")
    .selectAll()
    .where("username", "=", account.username)
    .executeTakeFirstOrThrow();
  console.log(`+ user ${account.username} (${account.role})`);
  return created;
}

async function main() {
  console.log("Seeding EduDesk demo data...");
  const users = new Map<string, Awaited<ReturnType<typeof ensureUser>>>();
  for (const account of demoAccounts) users.set(account.username, await ensureUser(account));

  const getUser = (username: string) => {
    const user = users.get(username);
    if (!user) throw new Error(`Seed user ${username} is missing`);
    return user;
  };
  const admin = getUser("admin");
  const teacher = getUser("teacher");
  const student = getUser("student");
  let organization = await db
    .selectFrom("organization")
    .selectAll()
    .where("slug", "=", "demo-school")
    .executeTakeFirst();
  if (!organization) {
    organization = await db
      .insertInto("organization")
      .values({
        name: "示范中学",
        slug: "demo-school",
        createdAt: new Date(),
        logo: null,
        metadata: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    console.log("+ organization 示范中学");
  }

  for (const account of demoAccounts) {
    const user = getUser(account.username);
    await db
      .insertInto("member")
      .values({
        id: crypto.randomUUID(),
        organizationId: organization.id,
        userId: user.id,
        role: account.role,
        createdAt: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(["organizationId", "userId"]).doUpdateSet({ role: account.role }),
      )
      .execute();
  }

  for (const app of APP_CATALOG) {
    await db
      .insertInto("tenant_modules")
      .values({
        organizationId: organization.id,
        moduleId: app.id,
        enabled: true,
        createdAt: new Date(),
      })
      .onConflict((oc) => oc.columns(["organizationId", "moduleId"]).doUpdateSet({ enabled: true }))
      .execute();
  }

  const announcement = await db
    .selectFrom("announcements")
    .select("id")
    .where("organizationId", "=", organization.id)
    .executeTakeFirst();
  if (!announcement) {
    await db
      .insertInto("announcements")
      .values([
        {
          organizationId: organization.id,
          authorId: admin.id,
          title: "欢迎使用 EduDesk 云桌面",
          content:
            "各位老师、同学：新一代校园云桌面已上线。所有应用集中在桌面中，并按学校授权开放。",
          createdAt: new Date(),
        },
        {
          organizationId: organization.id,
          authorId: teacher.id,
          title: "期中考试安排通知",
          content: "本学期期中考试定于下周三至周五进行，请老师提前录入试题并发布。",
          createdAt: new Date(),
        },
      ])
      .execute();
  }

  let exam = await db
    .selectFrom("exams")
    .selectAll()
    .where("organizationId", "=", organization.id)
    .where("title", "=", "高一数学·函数基础测验")
    .executeTakeFirst();
  if (!exam) {
    const startAt = new Date(Date.now() - 2 * 86_400_000);
    const endAt = new Date(Date.now() + 7 * 86_400_000);
    exam = await db
      .insertInto("exams")
      .values({
        organizationId: organization.id,
        title: "高一数学·函数基础测验",
        gradeLabel: "高一(3)班",
        subject: "数学",
        status: "published",
        startAt,
        endAt,
        createdBy: teacher.id,
        createdAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await db
      .insertInto("questions")
      .values([
        {
          examId: exam.id,
          idx: 1,
          stem: "函数 f(x) = 2x + 1，则 f(3) 的值为？",
          options: JSON.stringify(["5", "6", "7", "8"]),
          answer: "C",
          score: 20,
        },
        {
          examId: exam.id,
          idx: 2,
          stem: "下列函数中，是奇函数的是？",
          options: JSON.stringify(["x²", "x³", "|x|", "x+1"]),
          answer: "B",
          score: 20,
        },
        {
          examId: exam.id,
          idx: 3,
          stem: "函数 y = √(x-1) 的定义域是？",
          options: JSON.stringify(["x>1", "x≥1", "x<1", "全体实数"]),
          answer: "B",
          score: 20,
        },
        {
          examId: exam.id,
          idx: 4,
          stem: "偶函数 f(2)=3，则 f(-2)=？",
          options: JSON.stringify(["-3", "2", "3", "无法确定"]),
          answer: "C",
          score: 20,
        },
        {
          examId: exam.id,
          idx: 5,
          stem: "一次函数的图像是什么？",
          options: JSON.stringify(["直线", "抛物线", "双曲线", "圆"]),
          answer: "A",
          score: 20,
        },
      ])
      .execute();
  }

  await db
    .insertInto("submissions")
    .values({
      examId: exam.id,
      studentId: student.id,
      answers: JSON.stringify({
        "1": "C",
        "2": "B",
        "3": "A",
        "4": "C",
        "5": "A",
      }),
      score: 80,
      totalScore: 100,
      submittedAt: new Date(),
    })
    .onConflict((oc) => oc.columns(["examId", "studentId"]).doNothing())
    .execute();

  console.log("Seed complete: admin/admin123, teacher/teacher123, student/student123");
}

try {
  await main();
} finally {
  await closeDatabase();
}
