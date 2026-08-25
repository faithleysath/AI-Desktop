import { useState } from "react";
import { useExamStatsQuery, useExamsQuery, useMyGradesQuery } from "@/providers/api";
import { useDesktop } from "../DesktopContext";

export default function GradeApp() {
  const { role } = useDesktop();
  return role === "student" ? <MyGrades /> : <ExamStats />;
}

/* ================= 教师 / 管理员：考试统计 ================= */
function ExamStats() {
  const exams = useExamsQuery();
  const published = (exams.data ?? []).filter((e) => e.status === "published");
  const [examId, setExamId] = useState<string | null>(null);
  const sel = examId ?? published[0]?.id ?? null;
  const stats = useExamStatsQuery(sel ?? "", { enabled: sel !== null });

  if (exams.isLoading)
    return (
      <div className="app">
        <div className="empty-box">正在加载…</div>
      </div>
    );
  if (published.length === 0)
    return (
      <div className="app">
        <div className="empty-box">
          暂无已发布的考试
          <br />
          <br />
          到「考试管理」中创建并发布一场考试后，这里会生成统计分析
        </div>
      </div>
    );

  const BUCKET_LABELS = ["<60%", "60-70%", "70-80%", "80-90%", "90-100%"];
  const BUCKET_COLORS = ["#f43f5e", "#ff9a5c", "#f7b955", "#22c1a3", "#5b6ee1"];

  return (
    <div className="app">
      <div className="toolbar">
        <h2 style={{ margin: 0, flex: 1 }}>成绩分析</h2>
        <select className="inp" value={sel ?? ""} onChange={(e) => setExamId(e.target.value)}>
          {published.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </div>
      {stats.isLoading && <div className="empty-box">正在统计…</div>}
      {stats.data &&
        (() => {
          const d = stats.data;
          const maxBucket = Math.max(1, ...d.buckets);
          return (
            <>
              <div className="sub">
                {d.exam.gradeLabel} · {d.exam.subject} · 满分 {d.totalScore} 分 · 已交卷 {d.count}{" "}
                人
              </div>
              <div className="cards">
                <div className="stat">
                  <div className="k">平均分</div>
                  <div className="v">{d.avg}</div>
                  <div className="d" style={{ color: "#8a90a2" }}>
                    满分 {d.totalScore}
                  </div>
                </div>
                <div className="stat">
                  <div className="k">最高分</div>
                  <div className="v">{d.max}</div>
                  <div className="d up">👍</div>
                </div>
                <div className="stat">
                  <div className="k">最低分</div>
                  <div className="v">{d.min}</div>
                  <div className="d down">需关注</div>
                </div>
                <div className="stat">
                  <div className="k">及格率</div>
                  <div className="v">{d.passRate}%</div>
                  <div className="d" style={{ color: "#8a90a2" }}>
                    ≥60% 满分
                  </div>
                </div>
              </div>
              <div className="panel">
                <div className="ph">分数段分布（按满分百分比）</div>
                {d.buckets.map((n, i) => (
                  <div className="bar-row" key={BUCKET_LABELS[i]}>
                    <div className="bar-lbl" style={{ width: 64 }}>
                      {BUCKET_LABELS[i]}
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${(n / maxBucket) * 100}%`,
                          background: BUCKET_COLORS[i],
                        }}
                      />
                    </div>
                    <div className="bar-val">{n} 人</div>
                  </div>
                ))}
                {d.count === 0 && (
                  <div className="empty-box" style={{ padding: 18 }}>
                    暂无答卷数据
                  </div>
                )}
              </div>
              <div className="panel">
                <div className="ph">每题正确率</div>
                {d.perQuestion.map((q) => (
                  <div className="bar-row" key={q.idx} title={q.stem}>
                    <div className="bar-lbl">第 {q.idx} 题</div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${q.accuracy * 100}%`,
                          background: q.accuracy >= 0.6 ? "#22c1a3" : "#f43f5e",
                        }}
                      />
                    </div>
                    <div className="bar-val">{Math.round(q.accuracy * 100)}%</div>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: "#a0a5b8", marginTop: 6 }}>
                  悬停可查看题干 · 正确率低于 60% 的题目标红，建议重点讲评
                </div>
              </div>
            </>
          );
        })()}
    </div>
  );
}

/* ================= 学生：我的成绩 ================= */
function MyGrades() {
  const g = useMyGradesQuery();

  if (g.isLoading)
    return (
      <div className="app">
        <div className="empty-box">正在加载…</div>
      </div>
    );
  const d = g.data;
  if (!d || d.rows.length === 0)
    return (
      <div className="app">
        <div className="empty-box">
          还没有成绩记录
          <br />
          <br />
          到「考试管理」参加在线考试后，成绩会出现在这里
        </div>
      </div>
    );

  return (
    <div className="app">
      <h2>我的成绩</h2>
      <div className="sub">
        共 {d.rows.length} 场考试 · 平均得分率 {d.avgPct}%
      </div>
      <div className="cards">
        <div className="stat">
          <div className="k">已参加考试</div>
          <div className="v">{d.rows.length}</div>
          <div className="d" style={{ color: "#8a90a2" }}>
            场
          </div>
        </div>
        <div className="stat">
          <div className="k">平均得分率</div>
          <div className="v">{d.avgPct}%</div>
          <div className={`d ${d.avgPct >= 60 ? "up" : "down"}`}>
            {d.avgPct >= 60 ? "继续保持 💪" : "加油，别灰心"}
          </div>
        </div>
        <div className="stat">
          <div className="k">最高得分率</div>
          <div className="v">
            {Math.max(
              ...d.rows.map((r) => (r.totalScore ? (r.score / r.totalScore) * 100 : 0)),
            ).toFixed(0)}
            %
          </div>
          <div className="d up">最好的一次</div>
        </div>
      </div>
      <div className="panel" style={{ padding: "6px 14px" }}>
        <table className="tb">
          <thead>
            <tr>
              <th>考试</th>
              <th>科目</th>
              <th>年级</th>
              <th>得分</th>
              <th>满分</th>
              <th>得分率</th>
              <th>提交时间</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => {
              const pct = r.totalScore ? Math.round((r.score / r.totalScore) * 100) : 0;
              return (
                <tr key={r.id}>
                  <td>
                    <b>{r.examTitle}</b>
                  </td>
                  <td>{r.subject}</td>
                  <td>{r.gradeLabel}</td>
                  <td>
                    <b style={{ color: "#5b6ee1" }}>{r.score}</b>
                  </td>
                  <td>{r.totalScore}</td>
                  <td>
                    <span className={`pill ${pct >= 80 ? "g" : pct >= 60 ? "b" : "y"}`}>
                      {pct}%
                    </span>
                  </td>
                  <td>
                    {new Date(r.submittedAt).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
