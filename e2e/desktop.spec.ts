import { expect, type Page, test } from "@playwright/test";

async function login(page: Page, username: "admin" | "teacher" | "student") {
  await page.goto("/");
  await page.getByPlaceholder("用户名").fill(username);
  await page.getByPlaceholder("密码").fill(`${username}123`);
  await page.getByRole("button", { name: "进入桌面" }).click();
  await expect(page.locator(".icons")).toBeVisible();
  await expect(page.locator(".dicon")).toHaveCount(6);
}

async function openApp(page: Page, name: string) {
  await page.locator(".dicon", { hasText: name }).dblclick();
  await expect(page.locator(".window", { hasText: name })).toBeVisible();
}

test("role-aware desktop and administration paths", async ({ browser }) => {
  for (const username of ["admin", "teacher", "student"] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, username);
    await openApp(page, "校务消息");
    if (username === "student") {
      await expect(page.getByRole("button", { name: "+ 发布公告" })).toHaveCount(0);
    } else {
      await expect(page.getByRole("button", { name: "+ 发布公告" })).toBeVisible();
    }
    if (username === "admin") {
      await openApp(page, "系统设置");
      await expect(page.getByText("👥 账号管理")).toBeVisible();
    }
    await context.close();
  }
});

test("file center uploads through a presigned URL and soft deletes", async ({ page }) => {
  await login(page, "admin");
  await openApp(page, "文件中心");
  const name = `browser-${crypto.randomUUID()}.txt`;
  const content = "browser s3 roundtrip";
  await page.getByLabel("选择文件").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(content),
  });
  await page.getByRole("button", { name: "上传文件" }).click();
  const row = page.locator("tr", { hasText: name });
  await expect(row).toContainText("可用");
  const popupPromise = page.waitForEvent("popup");
  await row.getByText("下载", { exact: true }).click();
  const download = await popupPromise;
  await expect(download.locator("body")).toContainText(content);
  await download.close();
  await row.getByText("删除", { exact: true }).click();
  await expect(row).toHaveCount(0);
});

test("announcement invalidates another signed-in browser in real time", async ({ browser }) => {
  const teacherContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  const student = await studentContext.newPage();
  await login(teacher, "teacher");
  await login(student, "student");
  await openApp(teacher, "校务消息");
  await openApp(student, "校务消息");

  const title = `浏览器实时-${crypto.randomUUID()}`;
  await teacher.getByRole("button", { name: "+ 发布公告" }).click();
  await teacher.getByPlaceholder("公告标题…").fill(title);
  await teacher.getByPlaceholder("公告内容…").fill("来自教师浏览器的实时公告");
  await teacher.getByRole("button", { name: "确认发布" }).click();
  await expect(student.locator(".window").getByText(title, { exact: true })).toBeVisible();

  await studentContext.setOffline(true);
  const offlineTitle = `断线补拉-${crypto.randomUUID()}`;
  await teacher.getByRole("button", { name: "+ 发布公告" }).click();
  await teacher.getByPlaceholder("公告标题…").fill(offlineTitle);
  await teacher.getByPlaceholder("公告内容…").fill("学生断线期间发布");
  await teacher.getByRole("button", { name: "确认发布" }).click();
  await studentContext.setOffline(false);
  await expect(student.locator(".window").getByText(offlineTitle, { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await teacherContext.close();
  await studentContext.close();
});

test("teacher authors an exam, student submits it, and grade analytics update", async ({
  browser,
}) => {
  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await login(teacher, "teacher");
  await openApp(teacher, "考试管理");
  await teacher.getByRole("button", { name: "+ 新建考试" }).click();

  const title = `端到端考试-${crypto.randomUUID().slice(0, 8)}`;
  const localDateTime = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  await teacher.getByPlaceholder("如：高一数学·期中测验").fill(title);
  await teacher.getByPlaceholder("如：高一(3)班").fill("高一测试班");
  await teacher.getByPlaceholder("如：数学").fill("数学");
  await teacher
    .locator('input[type="datetime-local"]')
    .nth(0)
    .fill(localDateTime(new Date(Date.now() - 60_000)));
  await teacher
    .locator('input[type="datetime-local"]')
    .nth(1)
    .fill(localDateTime(new Date(Date.now() + 3_600_000)));
  await teacher.getByRole("button", { name: "创建并出题" }).click();
  await expect(teacher.getByText(`出题 · ${title}`)).toBeVisible();
  await teacher.getByPlaceholder("题干…").fill("2 + 2 = ?");
  await teacher.getByPlaceholder("选项 A 内容…").fill("3");
  await teacher.getByPlaceholder("选项 B 内容…").fill("4");
  await teacher.getByPlaceholder("选项 C 内容…").fill("5");
  await teacher.getByPlaceholder("选项 D 内容…").fill("6");
  await teacher.locator(".window").getByRole("button", { name: "B", exact: true }).click();
  await teacher.getByRole("button", { name: "添加本题" }).click();
  await expect(teacher.getByText("2 + 2 = ?")).toBeVisible();
  await teacher.getByRole("button", { name: "发布考试" }).click();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await login(student, "student");
  await openApp(student, "考试管理");
  const examCard = student.locator(".q-card", { hasText: title });
  await examCard.getByRole("button", { name: "进入考试" }).click();
  await student
    .locator(".q-card", { hasText: "2 + 2 = ?" })
    .getByText("B", { exact: true })
    .click();
  await student.getByRole("button", { name: "确认交卷" }).click();
  await expect(student.getByText("交卷成功")).toBeVisible();

  await openApp(teacher, "成绩分析");
  await teacher
    .locator(".window", { hasText: "成绩分析" })
    .locator("select")
    .selectOption({ label: title });
  await expect(teacher.locator(".window", { hasText: "成绩分析" })).toContainText("已交卷 1 人");

  await studentContext.close();
  await teacherContext.close();
});
