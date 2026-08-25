import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useDesktop } from "../DesktopContext";
import { ROLE_NAMES, type Role } from "@contracts/apps";

type Page = "general" | "accounts" | "modules" | "about";

const WP_NAMES = ["星空紫", "落日橙", "深海蓝"];
const ROLE_COLORS: Record<Role, string> = {
  admin: "linear-gradient(135deg,#6c5cff,#00beff)",
  teacher: "linear-gradient(135deg,#22c1a3,#3ddc84)",
  student: "linear-gradient(135deg,#ff9a5c,#ff6a88)",
};

export default function SettingsApp() {
  const { role } = useDesktop();
  const [page, setPage] = useState<Page>("general");
  const isAdmin = role === "admin";

  const menus: { key: Page; label: string }[] = [
    { key: "general", label: "🎨 通用" },
    ...(isAdmin ? [{ key: "accounts" as Page, label: "👥 账号管理" }, { key: "modules" as Page, label: "🧩 模块授权" }] : []),
    { key: "about", label: "ℹ️ 关于" },
  ];

  return (
    <div className="set-wrap">
      <div className="set-menu">
        {menus.map(m => (
          <div key={m.key} className={`set-mi ${page === m.key ? "on" : ""}`} onClick={() => setPage(m.key)}>{m.label}</div>
        ))}
      </div>
      <div className="set-page">
        {page === "general" && <General />}
        {page === "accounts" && isAdmin && <Accounts />}
        {page === "modules" && isAdmin && <Modules />}
        {page === "about" && <About />}
      </div>
    </div>
  );
}

function General() {
  const { wallpaper, setWallpaper, dockAutoHide, setDockAutoHide, accountName, role, tenantName } = useDesktop();
  return (
    <div>
      <h2>通用</h2>
      <div className="sub">桌面偏好会保存到云端，换设备登录也会同步</div>
      <div className="panel">
        <div className="ph">壁纸</div>
        <div className="wp-sw">
          {[0, 1, 2].map(i => (
            <div key={i} className={`wp-op wp-${i} ${wallpaper === i ? "on" : ""}`} onClick={() => setWallpaper(i)}
              style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 8, bottom: 6, fontSize: 11, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>{WP_NAMES[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="ph">任务栏</div>
        <div className="kv-row">
          <div>自动隐藏任务栏<div className="desc">无前台窗口时任务栏仍会显示；鼠标移至屏幕底部唤出</div></div>
          <label className="sw"><input type="checkbox" checked={dockAutoHide} onChange={e => setDockAutoHide(e.target.checked)} /><span className="sl" /></label>
        </div>
      </div>
      <div className="panel">
        <div className="ph">当前账号</div>
        <div className="kv-row"><div>姓名</div><b>{accountName}</b></div>
        <div className="kv-row"><div>角色</div><b>{ROLE_NAMES[role]}</b></div>
        <div className="kv-row"><div>学校</div><b>{tenantName}</b></div>
      </div>
    </div>
  );
}

function Modules() {
  const { toast, openApp } = useDesktop();
  const utils = trpc.useUtils();
  const mods = trpc.system.listModules.useQuery();
  const setModule = trpc.system.setModule.useMutation({
    onSuccess: (_, v) => {
      utils.system.visibleApps.invalidate();
      utils.system.listModules.invalidate();
      toast(v.enabled ? "模块已开通 ✅" : "模块已停用");
    },
    onError: (e) => toast(e.message),
  });

  return (
    <div>
      <h2>模块授权</h2>
      <div className="sub">按学校购买的模块逐个开通 · 关闭后全体师生桌面立即隐藏该应用（分模块售卖演示）</div>
      <div className="panel">
        {mods.isLoading && <div className="empty-box" style={{ padding: 18 }}>正在加载…</div>}
        {mods.data?.map(m => (
          <div className="mod-row" key={m.id}>
            <div className="mod-ico" style={{ background: m.color }}>{m.icon}</div>
            <div className="mod-info">
              <div className="mod-n">{m.name}</div>
              <div className="mod-d">{m.desc} · {m.cat}</div>
            </div>
            {m.enabled && <a style={{ fontSize: 12, color: "#5b6ee1", cursor: "pointer" }} onClick={() => openApp(m.id)}>打开</a>}
            <label className={`sw ${m.id === "settings" ? "dis" : ""}`} title={m.id === "settings" ? "系统必备模块不可停用" : ""}>
              <input type="checkbox" checked={m.enabled} disabled={m.id === "settings"}
                onChange={e => setModule.mutate({ moduleId: m.id, enabled: e.target.checked })} />
              <span className="sl" />
            </label>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#a0a5b8" }}>「系统设置」为基座必备模块，不可停用</div>
    </div>
  );
}

function Accounts() {
  const { toast } = useDesktop();
  const utils = trpc.useUtils();
  const list = trpc.system.listAccounts.useQuery();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [showForm, setShowForm] = useState(false);

  const create = trpc.system.createAccount.useMutation({
    onSuccess: () => {
      toast("账号已创建 ✅");
      setUsername(""); setPassword(""); setName(""); setShowForm(false);
      utils.system.listAccounts.invalidate();
    },
    onError: (e) => toast(e.message),
  });

  const ok = /^[a-zA-Z0-9_]{2,64}$/.test(username) && password.length >= 6 && name.trim();

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0, flex: 1 }}>账号管理</h2>
        <button className="btn" onClick={() => setShowForm(v => !v)}>{showForm ? "取消" : "+ 新建账号"}</button>
      </div>
      {showForm && (
        <div className="panel">
          <div className="ph">新建账号</div>
          <div className="form-row"><span className="f-lbl">用户名</span><input className="inp" placeholder="字母、数字、下划线" value={username} onChange={e => setUsername(e.target.value)} /></div>
          <div className="form-row"><span className="f-lbl">姓名</span><input className="inp" placeholder="真实姓名" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="form-row"><span className="f-lbl">初始密码</span><input className="inp" type="text" placeholder="至少 6 位" value={password} onChange={e => setPassword(e.target.value)} /></div>
          <div className="form-row">
            <span className="f-lbl">角色</span>
            {(["student", "teacher", "admin"] as Role[]).map(r => (
              <button key={r} className={`btn ${role === r ? "" : "ghost"}`} style={{ padding: "6px 14px" }} onClick={() => setRole(r)}>{ROLE_NAMES[r]}</button>
            ))}
          </div>
          <button className="btn" disabled={!ok || create.isPending}
            onClick={() => create.mutate({ username: username.trim(), password, name: name.trim(), role })}>
            {create.isPending ? "创建中…" : "创建账号"}
          </button>
        </div>
      )}
      <div className="panel">
        {list.isLoading && <div className="empty-box" style={{ padding: 18 }}>正在加载…</div>}
        {list.data?.map(a => (
          <div className="role-row" key={a.id}>
            <div className="av" style={{ background: ROLE_COLORS[a.role] }}>{a.name[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{a.name}</div>
              <div style={{ fontSize: 11.5, color: "#8a90a2" }}>@{a.username}</div>
            </div>
            <span className={`pill ${a.role === "admin" ? "b" : a.role === "teacher" ? "g" : "gray"}`}>{ROLE_NAMES[a.role]}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#a0a5b8" }}>共 {list.data?.length ?? 0} 个账号 · 学生与教师凭用户名密码登录桌面</div>
    </div>
  );
}

function About() {
  return (
    <div>
      <h2>关于</h2>
      <div className="sub">EduDesk · 智慧校园桌面基座 MVP</div>
      <div className="panel">
        <div className="kv-row"><div>架构</div><b>WebDesktop 基座 + 窗口化应用</b></div>
        <div className="kv-row"><div>耦合方式</div><b>清单驱动 · 应用间零依赖</b></div>
        <div className="kv-row"><div>授权模型</div><b>租户 License × 角色 过滤下发</b></div>
        <div className="kv-row"><div>数据</div><b>云端数据库持久化</b></div>
        <div className="kv-row"><div>版本</div><b>v0.2 MVP</b></div>
      </div>
      <div style={{ fontSize: 12, color: "#a0a5b8", lineHeight: 1.8 }}>
        所有功能以窗口应用形式运行在统一桌面中；真实环境下每个应用可独立技术栈构建（Vue3 / React / Astro），基座只通过清单与 SDK 与之通信。
      </div>
    </div>
  );
}
