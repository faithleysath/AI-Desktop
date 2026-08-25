import { api } from "@/providers/api";
import { useDesktop } from "../DesktopContext";

export default function DashboardApp() {
  const { accountName, tenantName, role } = useDesktop();
  const stats = api.dashboard.stats.useQuery();

  const h = new Date().getHours();
  const greet =
    h < 6 ? "夜深了" : h < 12 ? "早上好" : h < 14 ? "中午好" : h < 18 ? "下午好" : "晚上好";

  if (stats.isLoading)
    return (
      <div className="app">
        <div className="empty-box">正在加载数据…</div>
      </div>
    );
  if (stats.error || !stats.data)
    return (
      <div className="app">
        <div className="empty-box">加载失败：{stats.error?.message}</div>
      </div>
    );
  const d = stats.data;

  const trend = d.trend;
  const max = Math.max(1, ...trend);
  const W = 600,
    H = 160,
    step = W / (trend.length - 1);
  const pts = trend.map((v, i) => [i * step, H - 16 - (v / max) * (H - 44)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <div className="app">
      <h2>
        {greet}，{accountName} 👋
      </h2>
      <div className="sub">{tenantName} · 全校数据总览 · 实时数据</div>
      <div className="cards">
        <div className="stat">
          <div className="k">在校学生</div>
          <div className="v">{d.studentCount}</div>
          <div className="d" style={{ color: "#8a90a2" }}>
            已注册账号
          </div>
        </div>
        <div className="stat">
          <div className="k">在职教师</div>
          <div className="v">{d.teacherCount}</div>
          <div className="d" style={{ color: "#8a90a2" }}>
            已注册账号
          </div>
        </div>
        <div className="stat">
          <div className="k">本月考试</div>
          <div className="v">{d.monthExams}</div>
          <div className="d" style={{ color: "#8a90a2" }}>
            本月新建
          </div>
        </div>
        <div className="stat">
          <div className="k">{d.todoLabel}</div>
          <div className="v">{d.todoCount}</div>
          <div className={`d ${d.todoCount > 0 ? "down" : "up"}`}>
            {d.todoCount > 0 ? "需要处理" : "全部完成 🎉"}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="ph">近 14 日答卷提交趋势</div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 150 }}>
          <title>近 14 日答卷提交趋势</title>
          <defs>
            <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5b6ee1" stopOpacity=".35" />
              <stop offset="1" stopColor="#5b6ee1" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[40, 80, 120].map((y) => (
            <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="#eef0f6" />
          ))}
          <path d={area} fill="url(#ag)" />
          <path d={line} fill="none" stroke="#5b6ee1" strokeWidth="2.5" strokeLinecap="round" />
          {pts.map((p) => (
            <circle
              key={`${p[0]}-${p[1]}`}
              cx={p[0]}
              cy={p[1]}
              r="3.5"
              fill="#fff"
              stroke="#5b6ee1"
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>
      <div className="panel">
        <div className="ph">最新校务消息</div>
        {d.recent.length === 0 && (
          <div className="empty-box" style={{ padding: 20 }}>
            暂无消息
          </div>
        )}
        {d.recent.map((m) => (
          <div className="msg" key={m.id}>
            <div className="av" style={{ background: "#eef0f8" }}>
              📢
            </div>
            <div style={{ flex: 1 }}>
              <div className="mt">{m.title}</div>
              <div className="ms">
                {m.authorName} · {new Date(m.createdAt).toLocaleDateString("zh-CN")}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#a0a5b8" }}>
        当前角色：
        {role === "admin" ? "管理员" : role === "teacher" ? "教师" : "学生"} · 数据来自云端数据库
      </div>
    </div>
  );
}
