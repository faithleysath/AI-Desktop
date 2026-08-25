import { useState } from "react";
import { api } from "@/providers/api";
import { useDesktop } from "../DesktopContext";

const OPTS = ["A", "B", "C", "D"] as const;
type OptKey = (typeof OPTS)[number];

const dt = (d: Date | string) =>
  new Date(d).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ExamApp() {
  const { role } = useDesktop();
  return role === "student" ? <StudentExam /> : <TeacherExam />;
}

/* ================= 教师 / 管理员视角 ================= */
function TeacherExam() {
  const { toast } = useDesktop();
  const utils = api.useUtils();
  const list = api.exam.list.useQuery();
  const [view, setView] = useState<
    | { kind: "list" }
    | { kind: "create" }
    | { kind: "questions"; examId: string }
    | { kind: "results"; examId: string }
  >({ kind: "list" });
  const [q, setQ] = useState("");

  const refresh = () => {
    utils.exam.list.invalidate();
    utils.dashboard.stats.invalidate();
  };

  const create = api.exam.create.useMutation({
    onSuccess: (r) => {
      toast("考试已创建，请添加试题");
      refresh();
      setView({ kind: "questions", examId: r.id });
    },
    onError: (e) => toast(e.message),
  });
  const publish = api.exam.publish.useMutation({
    onSuccess: () => {
      toast("考试已发布 ✅");
      refresh();
    },
    onError: (e) => toast(e.message),
  });
  const remove = api.exam.remove.useMutation({
    onSuccess: () => {
      toast("草稿已删除");
      refresh();
    },
    onError: (e) => toast(e.message),
  });

  if (view.kind === "create")
    return (
      <CreateExam
        onBack={() => setView({ kind: "list" })}
        onCreate={(v) => create.mutate(v)}
        pending={create.isPending}
      />
    );
  if (view.kind === "questions") {
    const title = list.data?.find((e) => e.id === view.examId)?.title ?? "";
    return (
      <QuestionEditor
        examId={view.examId}
        examTitle={title}
        onBack={() => {
          refresh();
          setView({ kind: "list" });
        }}
      />
    );
  }
  if (view.kind === "results")
    return <Results examId={view.examId} onBack={() => setView({ kind: "list" })} />;

  const rows = (list.data ?? []).filter((e) => !q || e.title.includes(q) || e.subject.includes(q));

  return (
    <div className="app">
      <div className="toolbar">
        <input
          className="inp"
          placeholder="搜索考试名称 / 科目…"
          style={{ flex: 1, maxWidth: 260 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn" onClick={() => setView({ kind: "create" })}>
          + 新建考试
        </button>
      </div>
      <div className="panel" style={{ padding: "6px 14px" }}>
        <table className="tb">
          <thead>
            <tr>
              <th>考试名称</th>
              <th>年级</th>
              <th>科目</th>
              <th>题目数</th>
              <th>答卷</th>
              <th>时间窗口</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>
                  <b>{e.title}</b>
                </td>
                <td>{e.gradeLabel}</td>
                <td>{e.subject}</td>
                <td>{e.questionCount}</td>
                <td>{e.submissionCount}</td>
                <td style={{ fontSize: 11.5 }}>
                  {dt(e.startAt)} ~ {dt(e.endAt)}
                </td>
                <td>
                  {e.status === "published" ? (
                    <span className="pill b">已发布</span>
                  ) : (
                    <span className="pill y">草稿</span>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {e.status === "draft" ? (
                    <>
                      <a
                        style={{ color: "#5b6ee1", cursor: "pointer" }}
                        onClick={() => setView({ kind: "questions", examId: e.id })}
                      >
                        出题
                      </a>
                      {" · "}
                      <a
                        style={{ color: "#16a34a", cursor: "pointer" }}
                        onClick={() => publish.mutate({ examId: e.id })}
                      >
                        发布
                      </a>
                      {" · "}
                      <a
                        style={{ color: "#f43f5e", cursor: "pointer" }}
                        onClick={() => remove.mutate({ examId: e.id })}
                      >
                        删除
                      </a>
                    </>
                  ) : (
                    <a
                      style={{ color: "#5b6ee1", cursor: "pointer" }}
                      onClick={() => setView({ kind: "results", examId: e.id })}
                    >
                      成绩
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="empty-box">
            {list.isLoading ? "正在加载…" : "暂无考试，点击「+ 新建考试」开始"}
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#a0a5b8" }}>
        共 {rows.length} 条记录 · 题型：单项选择题
      </div>
    </div>
  );
}

function CreateExam({
  onBack,
  onCreate,
  pending,
}: {
  onBack: () => void;
  onCreate: (v: {
    title: string;
    gradeLabel: string;
    subject: string;
    startAt: Date;
    endAt: Date;
  }) => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [gradeLabel, setGradeLabel] = useState("");
  const [subject, setSubject] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const ok = title.trim() && gradeLabel.trim() && subject.trim() && startAt && endAt;

  return (
    <div className="app">
      <div className="toolbar">
        <button className="btn ghost" onClick={onBack}>
          ← 返回
        </button>
        <h2 style={{ margin: 0 }}>新建考试</h2>
      </div>
      <div className="panel">
        <div className="form-row">
          <span className="f-lbl">考试名称</span>
          <input
            className="inp"
            placeholder="如：高一数学·期中测验"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="form-row">
          <span className="f-lbl">年级班级</span>
          <input
            className="inp"
            placeholder="如：高一(3)班"
            value={gradeLabel}
            onChange={(e) => setGradeLabel(e.target.value)}
          />
        </div>
        <div className="form-row">
          <span className="f-lbl">科目</span>
          <input
            className="inp"
            placeholder="如：数学"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="form-row">
          <span className="f-lbl">开始时间</span>
          <input
            className="inp"
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
          />
        </div>
        <div className="form-row">
          <span className="f-lbl">结束时间</span>
          <input
            className="inp"
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
          />
        </div>
        <button
          className="btn"
          disabled={!ok || pending}
          onClick={() =>
            onCreate({
              title: title.trim(),
              gradeLabel: gradeLabel.trim(),
              subject: subject.trim(),
              startAt: new Date(startAt),
              endAt: new Date(endAt),
            })
          }
        >
          {pending ? "创建中…" : "创建并出题"}
        </button>
      </div>
      <div style={{ fontSize: 12, color: "#a0a5b8" }}>
        创建后进入「出题」环节，至少 1 道题才能发布
      </div>
    </div>
  );
}

function QuestionEditor({
  examId,
  examTitle,
  onBack,
}: {
  examId: string;
  examTitle: string;
  onBack: () => void;
}) {
  const { toast } = useDesktop();
  const utils = api.useUtils();
  const qs = api.exam.questions.useQuery({ examId });
  const [stem, setStem] = useState("");
  const [opts, setOpts] = useState(["", "", "", ""]);
  const [answer, setAnswer] = useState<OptKey>("A");
  const [score, setScore] = useState(20);

  const refresh = () => {
    utils.exam.questions.invalidate({ examId });
    utils.exam.list.invalidate();
  };

  const add = api.exam.addQuestion.useMutation({
    onSuccess: () => {
      setStem("");
      setOpts(["", "", "", ""]);
      setAnswer("A");
      refresh();
      toast("已添加试题");
    },
    onError: (e) => toast(e.message),
  });
  const removeQ = api.exam.removeQuestion.useMutation({
    onSuccess: refresh,
    onError: (e) => toast(e.message),
  });
  const publish = api.exam.publish.useMutation({
    onSuccess: () => {
      toast("考试已发布 ✅");
      onBack();
    },
    onError: (e) => toast(e.message),
  });

  const questions = qs.data ?? [];
  const total = questions.reduce((s, x) => s + x.score, 0);
  const canAdd = stem.trim() && opts.every((o) => o.trim());

  return (
    <div className="app">
      <div className="toolbar">
        <button className="btn ghost" onClick={onBack}>
          ← 返回列表
        </button>
        <h2 style={{ margin: 0, flex: 1 }}>出题 · {examTitle}</h2>
        <button
          className="btn"
          disabled={questions.length === 0 || publish.isPending}
          onClick={() => publish.mutate({ examId })}
        >
          发布考试
        </button>
      </div>
      {questions.map((x) => (
        <div className="q-card" key={x.id}>
          <div className="q-stem">
            {x.idx}. {x.stem}
            <span style={{ float: "right", fontSize: 11, color: "#8a90a2" }}>
              {x.score} 分
              <a
                style={{ color: "#f43f5e", cursor: "pointer", marginLeft: 10 }}
                onClick={() => removeQ.mutate({ questionId: x.id })}
              >
                删除
              </a>
            </span>
          </div>
          {x.options.map((o, i) => (
            <div
              key={i}
              className={`q-opt ${OPTS[i] === x.answer ? "right" : ""}`}
              style={{ cursor: "default" }}
            >
              <span className="k">{OPTS[i]}</span>
              <span>{o}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="panel">
        <div className="ph">+ 添加选择题（单选）</div>
        <div className="form-row">
          <textarea
            className="inp"
            rows={2}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
            placeholder="题干…"
            value={stem}
            onChange={(e) => setStem(e.target.value)}
          />
        </div>
        {opts.map((o, i) => (
          <div className="form-row" key={i}>
            <span className="f-lbl">选项 {OPTS[i]}</span>
            <input
              className="inp"
              value={o}
              placeholder={`选项 ${OPTS[i]} 内容…`}
              onChange={(e) =>
                setOpts((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
              }
            />
          </div>
        ))}
        <div className="form-row">
          <span className="f-lbl">正确答案</span>
          {OPTS.map((k) => (
            <button
              key={k}
              className={`btn ${answer === k ? "" : "ghost"}`}
              style={{ padding: "6px 14px" }}
              onClick={() => setAnswer(k)}
            >
              {k}
            </button>
          ))}
          <span className="f-lbl" style={{ width: "auto", marginLeft: 10 }}>
            分值
          </span>
          <input
            className="inp"
            type="number"
            style={{ width: 80, flex: "none" }}
            value={score}
            min={1}
            max={100}
            onChange={(e) => setScore(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
          />
        </div>
        <button
          className="btn"
          disabled={!canAdd || add.isPending}
          onClick={() =>
            add.mutate({
              examId,
              stem: stem.trim(),
              options: opts.map((o) => o.trim()),
              answer,
              score,
            })
          }
        >
          {add.isPending ? "添加中…" : "添加本题"}
        </button>
      </div>
      <div style={{ fontSize: 12, color: "#a0a5b8" }}>
        已录入 {questions.length} 题 · 满分 {total} 分 · 发布后不可再修改
      </div>
    </div>
  );
}

function Results({ examId, onBack }: { examId: string; onBack: () => void }) {
  const r = api.exam.results.useQuery({ examId });
  return (
    <div className="app">
      <div className="toolbar">
        <button className="btn ghost" onClick={onBack}>
          ← 返回列表
        </button>
        <h2 style={{ margin: 0 }}>答卷 · {r.data?.exam.title ?? ""}</h2>
      </div>
      <div className="panel" style={{ padding: "6px 14px" }}>
        <table className="tb">
          <thead>
            <tr>
              <th>#</th>
              <th>学生</th>
              <th>账号</th>
              <th>得分</th>
              <th>满分</th>
              <th>得分率</th>
              <th>提交时间</th>
            </tr>
          </thead>
          <tbody>
            {r.data?.rows.map((x, i) => (
              <tr key={x.id}>
                <td>{i + 1}</td>
                <td>
                  <b>{x.studentName}</b>
                </td>
                <td>{x.studentUsername}</td>
                <td>
                  <b style={{ color: "#5b6ee1" }}>{x.score}</b>
                </td>
                <td>{x.totalScore}</td>
                <td>{x.totalScore ? Math.round((x.score / x.totalScore) * 100) : 0}%</td>
                <td>{dt(x.submittedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.data?.rows.length === 0 && <div className="empty-box">还没有学生提交答卷</div>}
        {r.isLoading && <div className="empty-box">正在加载…</div>}
      </div>
    </div>
  );
}

/* ================= 学生视角 ================= */
function StudentExam() {
  const utils = api.useUtils();
  const list = api.exam.list.useQuery();
  const [taking, setTaking] = useState<string | null>(null);
  const [done, setDone] = useState<{
    score: number;
    totalScore: number;
  } | null>(null);

  if (taking !== null) {
    return (
      <TakeExam
        examId={taking}
        onExit={() => setTaking(null)}
        onDone={(r) => {
          setDone(r);
          setTaking(null);
          utils.exam.list.invalidate();
          utils.grade.myGrades.invalidate();
          utils.dashboard.stats.invalidate();
        }}
      />
    );
  }
  if (done) {
    return (
      <div className="app">
        <div className="score-hero">
          <div style={{ fontSize: 15, marginBottom: 8 }}>🎉 交卷成功</div>
          <div className="big">{done.score}</div>
          <div className="of">满分 {done.totalScore} 分 · 客观题已自动评分</div>
        </div>
        <div style={{ textAlign: "center", marginTop: 18 }}>
          <button className="btn" onClick={() => setDone(null)}>
            返回考试列表
          </button>
        </div>
      </div>
    );
  }

  const now = Date.now();
  return (
    <div className="app">
      <h2>在线考试</h2>
      <div className="sub">按时进入考试 · 客观题提交后自动评分</div>
      {list.isLoading && <div className="empty-box">正在加载…</div>}
      {list.data?.length === 0 && <div className="empty-box">暂无已发布的考试</div>}
      {list.data?.map((e) => {
        const start = new Date(e.startAt).getTime(),
          end = new Date(e.endAt).getTime();
        const open = now >= start && now <= end;
        const state = e.my ? (
          <span className="pill g">
            已完成 {e.my.score}/{e.my.totalScore}
          </span>
        ) : !open ? (
          <span className="pill gray">{now < start ? "未开始" : "已结束"}</span>
        ) : (
          <span className="pill b">可参加</span>
        );
        return (
          <div
            className="q-card"
            key={e.id}
            style={{ display: "flex", alignItems: "center", gap: 14 }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{e.title}</div>
              <div style={{ fontSize: 12, color: "#646c82", marginTop: 4 }}>
                {e.subject} · {e.gradeLabel} · {e.questionCount} 题 · {dt(e.startAt)} ~{" "}
                {dt(e.endAt)}
              </div>
            </div>
            {state}
            {!e.my && open && (
              <button className="btn" onClick={() => setTaking(e.id)}>
                进入考试
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TakeExam({
  examId,
  onExit,
  onDone,
}: {
  examId: string;
  onExit: () => void;
  onDone: (r: { score: number; totalScore: number }) => void;
}) {
  const { toast } = useDesktop();
  const take = api.exam.take.useQuery({ examId }, { retry: false });
  const [answers, setAnswers] = useState<Record<string, OptKey>>({});

  const submit = api.exam.submit.useMutation({
    onSuccess: (r) => onDone(r),
    onError: (e) => toast(e.message),
  });

  if (take.isLoading)
    return (
      <div className="app">
        <div className="empty-box">正在进入考场…</div>
      </div>
    );
  if (take.error || !take.data) {
    return (
      <div className="app">
        <div className="empty-box">{take.error?.message ?? "无法进入考试"}</div>
        <div style={{ textAlign: "center" }}>
          <button className="btn ghost" onClick={onExit}>
            返回
          </button>
        </div>
      </div>
    );
  }
  const { exam, questions } = take.data;
  const answered = questions.filter((x) => answers[String(x.id)]).length;
  const allDone = answered === questions.length;

  return (
    <div className="app">
      <div className="toolbar">
        <button className="btn ghost" onClick={onExit}>
          ← 退出
        </button>
        <h2 style={{ margin: 0, flex: 1 }}>{exam.title}</h2>
        <span className="pill b">
          已答 {answered}/{questions.length}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#8a90a2", marginBottom: 12 }}>
        全部作答后才能交卷 · 截止 {dt(exam.endAt)}
      </div>
      {questions.map((x) => (
        <div className="q-card" key={x.id}>
          <div className="q-stem">
            {x.idx}. {x.stem}
            <span style={{ float: "right", fontSize: 11, color: "#8a90a2" }}>{x.score} 分</span>
          </div>
          {x.options.map((o, i) => {
            const k = OPTS[i];
            const sel = answers[String(x.id)] === k;
            return (
              <div
                key={k}
                className={`q-opt ${sel ? "sel" : ""}`}
                onClick={() => setAnswers((prev) => ({ ...prev, [String(x.id)]: k }))}
              >
                <span className="k">{k}</span>
                <span>{o}</span>
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ textAlign: "center", margin: "16px 0 6px" }}>
        <button
          className="btn"
          style={{ padding: "10px 40px", fontSize: 14 }}
          disabled={!allDone || submit.isPending}
          onClick={() => submit.mutate({ examId, answers })}
        >
          {submit.isPending
            ? "交卷中…"
            : allDone
              ? "确认交卷"
              : `还有 ${questions.length - answered} 题未作答`}
        </button>
      </div>
    </div>
  );
}
