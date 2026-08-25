import { type AppManifest, ROLE_NAMES } from "@contracts/apps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useMessagesQuery,
  usePreferencesQuery,
  useSetPreferencesMutation,
  useVisibleAppsQuery,
} from "@/providers/api";
import DashboardApp from "./apps/DashboardApp";
import ExamApp from "./apps/ExamApp";
import FilesApp from "./apps/FilesApp";
import GradeApp from "./apps/GradeApp";
import MessageApp from "./apps/MessageApp";
import SettingsApp from "./apps/SettingsApp";
import { Ctx, type DesktopCtx } from "./DesktopContext";
import { useSession } from "./useSession";
import "./desktop.css";

const TB_SAFE = 76;
const APP_VIEWS: Record<string, React.ComponentType> = {
  dashboard: DashboardApp,
  exam: ExamApp,
  grade: GradeApp,
  message: MessageApp,
  files: FilesApp,
  settings: SettingsApp,
};
const APP_TAGS: Record<string, string> = {
  dashboard: "React",
  exam: "React",
  grade: "React",
  message: "React",
  files: "React",
  settings: "React",
};

interface WinState {
  appId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  maximized: boolean;
  prev: { x: number; y: number; w: number; h: number } | null;
  min: "open" | "minimizing" | "minimized" | "restoring";
  opening: boolean;
  closing: boolean;
  geoAnim: boolean;
  dragging: boolean;
}

export default function Desktop() {
  const { account, tenant, loading, login, logout } = useSession();

  if (loading) {
    return (
      <div className="edudesk">
        <div className="wallpaper wp-0" />
        <div className="boot">
          <div className="login-card">
            <div className="login-name">正在进入桌面…</div>
          </div>
        </div>
      </div>
    );
  }
  if (!account) {
    return (
      <Boot
        login={(u, p) => login.mutateAsync({ username: u, password: p })}
        pending={login.isPending}
      />
    );
  }
  return (
    <Shell
      accountName={account.name}
      role={account.role}
      tenantName={tenant?.name ?? ""}
      onLogout={() => logout.mutate()}
    />
  );
}

/* ================= 登录页 ================= */
function Boot({
  login,
  pending,
}: {
  login: (u: string, p: string) => Promise<unknown>;
  pending: boolean;
}) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const clock = useClock();

  const submit = async () => {
    if (!u.trim() || !p || pending) return;
    setErr("");
    try {
      await login(u.trim(), p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "登录失败");
    }
  };

  return (
    <div className="edudesk">
      <div className="wallpaper wp-0" />
      <div className="boot">
        <div className="login-brand">
          EduDesk · 智慧校园桌面<b>MVP v0.2</b>
        </div>
        <div className="login-clock">
          <div className="t">{clock.t}</div>
          <div className="d">{clock.dFull}</div>
        </div>
        <div className="login-card">
          <div className="login-avatar">🏫</div>
          <div className="login-name">欢迎回来</div>
          <div className="login-role">请使用学校分配的账号登录</div>
          <input
            className="login-inp"
            placeholder="用户名"
            value={u}
            onChange={(e) => setU(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <input
            className="login-inp"
            type="password"
            placeholder="密码"
            value={p}
            onChange={(e) => setP(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          {err && <div className="login-err">{err}</div>}
          <button className="login-btn" disabled={pending || !u.trim() || !p} onClick={submit}>
            {pending ? "登录中…" : "进入桌面"}
          </button>
          <div className="login-tip">
            演示账号（密码 = 用户名 + 123）：
            <br />
            <code>admin</code> 管理员 · <code>teacher</code> 教师 · <code>student</code> 学生
            <br />
            双击桌面图标打开应用 · 窗口可拖拽 / 缩放 / 最小化
          </div>
        </div>
      </div>
    </div>
  );
}

function useClock() {
  const fmt = () => {
    const n = new Date();
    const pad = (x: number) => String(x).padStart(2, "0");
    const t = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
    const d = `${n.getMonth() + 1}月${n.getDate()}日 周${"日一二三四五六"[n.getDay()]}`;
    return { t, d, dFull: `${n.getFullYear()}年${d}` };
  };
  const [c, setC] = useState(fmt);
  useEffect(() => {
    const h = setInterval(() => setC(fmt()), 15000);
    return () => clearInterval(h);
  }, [fmt]);
  return c;
}

/* ================= 桌面外壳 ================= */
function Shell({
  accountName,
  role,
  tenantName,
  onLogout,
}: {
  accountName: string;
  role: "admin" | "teacher" | "student";
  tenantName: string;
  onLogout: () => void;
}) {
  const appsQ = useVisibleAppsQuery();
  const prefsQ = usePreferencesQuery();
  const msgsQ = useMessagesQuery();
  const apps = useMemo(() => appsQ.data ?? [], [appsQ.data]);

  /* ---------- 偏好（云端漫游） ---------- */
  const [wallpaper, setWp] = useState(0);
  const [dockAH, setDockAH] = useState(true);
  useEffect(() => {
    if (prefsQ.data) {
      setWp(prefsQ.data.wallpaper);
      setDockAH(prefsQ.data.dockAutoHide);
    }
  }, [prefsQ.data]);
  const setPrefs = useSetPreferencesMutation();
  const setWallpaper = useCallback(
    (i: number) => {
      setWp(i);
      setPrefs.mutate({ wallpaper: i });
    },
    [setPrefs.mutate],
  );
  const setDockAutoHide = useCallback(
    (v: boolean) => {
      setDockAH(v);
      setPrefs.mutate({ dockAutoHide: v });
    },
    [setPrefs.mutate],
  );

  /* ---------- Toast ---------- */
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastShow(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShow(false), 2400);
  }, []);

  /* ---------- 窗口管理器 ---------- */
  const [wins, setWins] = useState<WinState[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const zTop = useRef(20);
  const cascade = useRef(0);
  const winEls = useRef(new Map<string, HTMLDivElement>());

  const patchWin = useCallback((id: string, patch: Partial<WinState>) => {
    setWins((prev) => prev.map((w) => (w.appId === id ? { ...w, ...patch } : w)));
  }, []);

  const focusWindow = useCallback((id: string) => {
    setFocusId(id);
    setWins((prev) => prev.map((w) => (w.appId === id ? { ...w, z: ++zTop.current } : w)));
  }, []);

  const hasVisibleWin = (list: WinState[]) =>
    list.some((w) => w.min !== "minimized" && w.min !== "minimizing" && !w.closing);

  const restoreWindow = useCallback(
    (id: string) => {
      setWins((prev) =>
        prev.map((w) => (w.appId === id && w.min === "minimized" ? { ...w, min: "restoring" } : w)),
      );
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          patchWin(id, { min: "open" });
          focusWindow(id);
        }),
      );
    },
    [patchWin, focusWindow],
  );

  const openApp = useCallback(
    (id: string) => {
      const app = apps.find((a) => a.id === id);
      if (!app) {
        toast("该模块未开通或无权访问");
        return;
      }
      setWins((prev) => {
        const exist = prev.find((w) => w.appId === id);
        if (exist) {
          setTimeout(() => restoreWindow(id), 0);
          return prev;
        }
        const W = Math.min(app.w, window.innerWidth - 40);
        const H = Math.min(app.h, window.innerHeight - TB_SAFE - 30);
        const x = Math.max(20, (window.innerWidth - W) / 2 + (cascade.current % 4) * 36 - 54);
        const y = Math.max(
          14,
          (window.innerHeight - TB_SAFE - H) / 2 + (cascade.current % 4) * 26 - 20,
        );
        cascade.current++;
        setTimeout(() => {
          patchWin(id, { opening: false });
          focusWindow(id);
        }, 380);
        setTimeout(() => focusWindow(id), 0);
        return [
          ...prev,
          {
            appId: id,
            x,
            y,
            w: W,
            h: H,
            z: ++zTop.current,
            maximized: false,
            prev: null,
            min: "open",
            opening: true,
            closing: false,
            geoAnim: false,
            dragging: false,
          },
        ];
      });
    },
    [apps, toast, patchWin, focusWindow, restoreWindow],
  );

  const closeWindow = useCallback(
    (id: string) => {
      patchWin(id, { closing: true });
      setTimeout(() => {
        setWins((prev) => prev.filter((w) => w.appId !== id));
        winEls.current.delete(id);
      }, 150);
    },
    [patchWin],
  );

  const minimizeWindow = useCallback(
    (id: string) => {
      patchWin(id, { min: "minimizing" });
      setTimeout(() => {
        patchWin(id, { min: "minimized" });
        // 焦点让给最上层可见窗口
        setWins((prev) => {
          const vis = prev.filter((w) => w.appId !== id && w.min === "open" && !w.closing);
          if (vis.length) {
            const top = vis.reduce((a, b) => (a.z > b.z ? a : b));
            setTimeout(() => focusWindow(top.appId), 0);
          } else setFocusId(null);
          return prev;
        });
      }, 210);
    },
    [patchWin, focusWindow],
  );

  const toggleMax = useCallback(
    (id: string, animate = true) => {
      const w = wins.find((x) => x.appId === id);
      if (!w) return;
      if (animate) {
        patchWin(id, { geoAnim: true });
        setTimeout(() => patchWin(id, { geoAnim: false }), 400);
      }
      if (!w.maximized) {
        patchWin(id, {
          prev: { x: w.x, y: w.y, w: w.w, h: w.h },
          x: 0,
          y: 0,
          w: window.innerWidth,
          h: window.innerHeight - (dockAH ? 10 : TB_SAFE - 6),
          maximized: true,
        });
      } else {
        patchWin(id, {
          ...(w.prev ?? { x: 60, y: 40, w: 860, h: 580 }),
          maximized: false,
        });
      }
      focusWindow(id);
    },
    [wins, dockAH, patchWin, focusWindow],
  );

  /* ---------- 任务栏自动隐藏 ---------- */
  const [dockShow, setDockShow] = useState(true);
  const dockTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!dockAH) {
      setDockShow(true);
      return;
    }
    if (!hasVisibleWin(wins)) {
      setDockShow(true);
      return;
    }
  }, [wins, dockAH, hasVisibleWin]);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dockAH) return;
      if (e.clientY >= window.innerHeight - 88 || !hasVisibleWin(wins)) {
        setDockShow(true);
        clearTimeout(dockTimer.current);
      } else {
        clearTimeout(dockTimer.current);
        dockTimer.current = setTimeout(() => setDockShow(false), 260);
      }
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [dockAH, wins, hasVisibleWin]);

  /* ---------- 涟漪（全局委托） ---------- */
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = (e.target as HTMLElement).closest?.(
        ".wctl,.btn,.tbtn,.dicon,.l-app,.l-chip,.set-mi,.msg,.q-opt,.wp-op",
      ) as HTMLElement | null;
      if (!t) return;
      t.classList.add("ripple-host");
      const r = t.getBoundingClientRect();
      const d = Math.max(r.width, r.height) * 2.2;
      const s = document.createElement("span");
      s.className = "ripple";
      s.style.width = s.style.height = `${d}px`;
      s.style.left = `${e.clientX - r.left - d / 2}px`;
      s.style.top = `${e.clientY - r.top - d / 2}px`;
      t.appendChild(s);
      setTimeout(() => s.remove(), 620);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  /* ---------- 启动器 / 通知 / 右键菜单 ---------- */
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [npOpen, setNpOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [selIcon, setSelIcon] = useState<string | null>(null);
  const [clearedNotifs, setClearedNotifs] = useState(false);
  const notifs = clearedNotifs ? [] : (msgsQ.data ?? []).slice(0, 5);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".dicon")) setSelIcon(null);
      if (!t.closest(".launcher-panel") && !t.closest(".launcher-btn")) setLauncherOpen(false);
      if (!t.closest(".npanel") && !t.closest(".tb-notif")) setNpOpen(false);
      if (!t.closest(".ctxmenu")) setCtxMenu(null);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const ctx: DesktopCtx = {
    toast,
    openApp,
    role,
    accountName,
    tenantName,
    wallpaper,
    setWallpaper,
    dockAutoHide: dockAH,
    setDockAutoHide,
  };
  const clock = useClock();

  return (
    <Ctx.Provider value={ctx}>
      <div
        className={`edudesk ${dockAH ? "dock-ah" : ""}`}
        onContextMenu={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest(".window") || t.closest(".taskbar")) return;
          e.preventDefault();
          setCtxMenu({
            x: Math.min(e.clientX, window.innerWidth - 200),
            y: Math.min(e.clientY, window.innerHeight - 160),
          });
        }}
      >
        <div className={`wallpaper wp-${wallpaper}`} />

        {/* 桌面图标 */}
        <div className="icons">
          {apps.map((a) => (
            <div
              key={a.id}
              className={`dicon ${selIcon === a.id ? "sel" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setSelIcon(a.id);
              }}
              onDoubleClick={() => openApp(a.id)}
            >
              <div className="tile" style={{ background: a.color }}>
                {a.icon}
              </div>
              <div className="lbl">{a.name}</div>
            </div>
          ))}
        </div>

        {/* 窗口层 */}
        <div className="windows">
          {wins.map((w) => {
            const app = apps.find((candidate) => candidate.id === w.appId);
            if (!app) return null;
            return (
              <Window
                key={w.appId}
                w={w}
                app={app}
                focused={focusId === w.appId && w.min === "open"}
                refEl={(el) => {
                  if (el) winEls.current.set(w.appId, el);
                }}
                onFocus={() => focusWindow(w.appId)}
                onClose={() => closeWindow(w.appId)}
                onMin={() => minimizeWindow(w.appId)}
                onMax={() => toggleMax(w.appId)}
                onGeo={(g) => patchWin(w.appId, g)}
                onDragState={(d) => patchWin(w.appId, { dragging: d })}
                onUnmaxDrag={(nx, ny) => {
                  const ratio = nx / window.innerWidth;
                  const prev = w.prev ?? { x: 60, y: 40, w: w.w, h: w.h };
                  patchWin(w.appId, {
                    ...prev,
                    maximized: false,
                    x: nx - prev.w * ratio,
                    y: Math.max(0, ny - 20),
                  });
                  focusWindow(w.appId);
                }}
              />
            );
          })}
        </div>

        {/* 启动器 */}
        <Launcher
          open={launcherOpen}
          apps={apps}
          onOpen={(id) => {
            setLauncherOpen(false);
            openApp(id);
          }}
        />

        {/* 通知面板 */}
        <div className={`npanel ${npOpen ? "show" : ""}`}>
          <div className="np-head">
            <b>通知中心</b>
            <span className="np-clear" onClick={() => setClearedNotifs(true)}>
              清空全部
            </span>
          </div>
          <div className="np-list">
            {notifs.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: 40,
                  opacity: 0.5,
                  fontSize: 13,
                }}
              >
                没有新通知 🎉
              </div>
            )}
            {notifs.map((n) => (
              <div
                className="np-item"
                key={n.id}
                onClick={() => {
                  setNpOpen(false);
                  openApp("message");
                }}
              >
                <div className="np-ico" style={{ background: "#eef0f8" }}>
                  📢
                </div>
                <div>
                  <div className="np-t">{n.title}</div>
                  <div className="np-s">
                    {n.content.length > 40 ? `${n.content.slice(0, 40)}…` : n.content}
                  </div>
                  <div className="np-time">
                    {n.authorName} · {new Date(n.createdAt).toLocaleDateString("zh-CN")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右键菜单 */}
        {ctxMenu && (
          <div className="ctxmenu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            <div
              className="ctx-item"
              onClick={() => {
                setWallpaper((wallpaper + 1) % 3);
                toast("壁纸已切换（偏好已同步到云端）");
              }}
            >
              🎨 更换壁纸
            </div>
            <div
              className="ctx-item"
              onClick={() => {
                setDockAutoHide(!dockAH);
                toast(dockAH ? "任务栏已固定" : "任务栏将自动隐藏");
              }}
            >
              📌 {dockAH ? "固定任务栏" : "自动隐藏任务栏"}
            </div>
            <div className="ctx-item" onClick={() => openApp("settings")}>
              ⚙️ 系统设置
            </div>
          </div>
        )}

        {/* 任务栏 */}
        <div className={`taskbar ${dockShow ? "show" : ""}`}>
          <button
            className="tbtn launcher-btn"
            title="启动器"
            onClick={(e) => {
              e.stopPropagation();
              setLauncherOpen((v) => !v);
            }}
          >
            ⊞
          </button>
          <div className="tb-sep" />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {wins.map((w) => {
              const app = apps.find((a) => a.id === w.appId);
              if (!app) return null;
              const active = focusId === w.appId && w.min === "open";
              return (
                <button
                  key={w.appId}
                  className={`tbtn ${active ? "active" : ""}`}
                  title={app.name}
                  onClick={() => {
                    if (w.min === "minimized") restoreWindow(w.appId);
                    else if (active) minimizeWindow(w.appId);
                    else focusWindow(w.appId);
                  }}
                >
                  {app.icon}
                  <span className="rdot" />
                </button>
              );
            })}
          </div>
          <div className="tb-sep" />
          <div className="tray">
            <button
              className="tbtn tb-notif"
              title="通知"
              onClick={(e) => {
                e.stopPropagation();
                setNpOpen((v) => !v);
              }}
            >
              🔔{notifs.length > 0 && <span className="badge">{notifs.length}</span>}
            </button>
            <div className="tray-clock">
              <div className="t">{clock.t}</div>
              <div className="d">{clock.d}</div>
            </div>
            <div
              className="tray-avatar"
              title={`${accountName} · ${ROLE_NAMES[role]} · 点击退出登录`}
              onClick={onLogout}
            >
              👤
            </div>
          </div>
        </div>

        <div className={`toast ${toastShow ? "show" : ""}`}>{toastMsg}</div>
      </div>
    </Ctx.Provider>
  );
}

/* ================= 单个窗口 ================= */
function Window({
  w,
  app,
  focused,
  refEl,
  onFocus,
  onClose,
  onMin,
  onMax,
  onGeo,
  onDragState,
  onUnmaxDrag,
}: {
  w: WinState;
  app: AppManifest;
  focused: boolean;
  refEl: (el: HTMLDivElement | null) => void;
  onFocus: () => void;
  onClose: () => void;
  onMin: () => void;
  onMax: () => void;
  onGeo: (g: Partial<WinState>) => void;
  onDragState: (d: boolean) => void;
  onUnmaxDrag: (clientX: number, clientY: number) => void;
}) {
  const Body = APP_VIEWS[w.appId];
  const elRef = useRef<HTMLDivElement | null>(null);

  const cls = [
    "window",
    focused ? "focused" : "",
    w.opening ? "opening" : "",
    w.closing ? "closing" : "",
    w.geoAnim ? "geo-anim" : "",
    w.dragging ? "dragging" : "",
    w.maximized ? "maximized" : "",
    w.min === "minimizing" ? "min-ing" : "",
    w.min === "restoring" ? "restoring" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style: React.CSSProperties = {
    left: w.x,
    top: w.y,
    width: w.w,
    height: w.h,
    zIndex: w.z,
    display: w.min === "minimized" ? "none" : "flex",
    ...(w.min === "restoring" ? { transform: "translateY(30px) scale(.95)", opacity: 0 } : {}),
  };

  /* 拖拽标题栏 */
  const onBarDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".wctl")) return;
    const el = elRef.current;
    if (!el) return;
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    onFocus();
    let sx = e.clientX,
      sy = e.clientY,
      ox = w.x,
      oy = w.y;
    let cur = { x: ox, y: oy };
    if (w.maximized) {
      onUnmaxDrag(e.clientX, e.clientY);
      // 等 state 生效后从 DOM 读实际位置
      requestAnimationFrame(() => {
        ox = el.offsetLeft;
        oy = el.offsetTop;
        sx = e.clientX;
        sy = e.clientY;
      });
    }
    onDragState(true);
    const move = (ev: PointerEvent) => {
      let nx = ox + ev.clientX - sx,
        ny = oy + ev.clientY - sy;
      ny = Math.max(0, Math.min(ny, window.innerHeight - TB_SAFE - 40));
      nx = Math.max(-el.offsetWidth + 120, Math.min(nx, window.innerWidth - 120));
      cur = { x: nx, y: ny };
      el.style.left = `${nx}px`;
      el.style.top = `${ny}px`;
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener(
      "pointerup",
      () => {
        bar.removeEventListener("pointermove", move);
        onDragState(false);
        onGeo(cur);
      },
      { once: true },
    );
  };

  /* 缩放 */
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>, d: string) => {
    e.preventDefault();
    e.stopPropagation();
    const el = elRef.current;
    if (!el) return;
    const h = e.currentTarget;
    h.setPointerCapture(e.pointerId);
    onFocus();
    const sx = e.clientX,
      sy = e.clientY;
    const r = { x: w.x, y: w.y, w: w.w, h: w.h };
    const cur = { x: r.x, y: r.y, w: r.w, h: r.h };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx,
        dy = ev.clientY - sy;
      let { x, y, w: ww, h: hh } = { ...r };
      if (d.includes("e")) ww = r.w + dx;
      if (d.includes("s")) hh = r.h + dy;
      if (d.includes("w")) {
        ww = r.w - dx;
        x = r.x + dx;
      }
      if (d.includes("n")) {
        hh = r.h - dy;
        y = r.y + dy;
      }
      if (ww >= 380) {
        el.style.width = `${ww}px`;
        cur.w = ww;
        if (d.includes("w")) {
          el.style.left = `${x}px`;
          cur.x = x;
        }
      }
      if (hh >= 260) {
        el.style.height = `${hh}px`;
        cur.h = hh;
        if (d.includes("n")) {
          const ny = Math.max(0, y);
          el.style.top = `${ny}px`;
          cur.y = ny;
        }
      }
    };
    h.addEventListener("pointermove", move);
    h.addEventListener(
      "pointerup",
      () => {
        h.removeEventListener("pointermove", move);
        onGeo(cur);
      },
      { once: true },
    );
  };

  return (
    <div
      className={cls}
      style={style}
      ref={(el) => {
        elRef.current = el;
        refEl(el);
      }}
      onPointerDownCapture={onFocus}
    >
      <div
        className="titlebar"
        onPointerDown={onBarDown}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest(".wctl")) onMax();
        }}
      >
        <div className="tb-icon" style={{ background: app.color }}>
          {app.icon}
        </div>
        <div className="tb-title">{app.name}</div>
        <div className="tb-tag">{APP_TAGS[w.appId] ?? "App"}</div>
        <div className="tb-spacer" />
        <button className="wctl" title="最小化" onClick={onMin}>
          —
        </button>
        <button className="wctl" title={w.maximized ? "还原" : "最大化"} onClick={onMax}>
          {w.maximized ? "❐" : "▢"}
        </button>
        <button className="wctl close" title="关闭" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="win-body">{Body ? <Body /> : null}</div>
      {!w.maximized &&
        ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => (
          <div key={d} className={`rh ${d}`} onPointerDown={(e) => onResizeDown(e, d)} />
        ))}
    </div>
  );
}

/* ================= 启动器 ================= */
function Launcher({
  open,
  apps,
  onOpen,
}: {
  open: boolean;
  apps: AppManifest[];
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("全部");
  const [animating, setAnimating] = useState(false);
  const animTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (open) {
      setQ("");
      setCat("全部");
    }
  }, [open]);

  const cats = ["全部", ...new Set(apps.map((a) => a.cat))];
  const list = apps
    .filter((a) => cat === "全部" || a.cat === cat)
    .filter((a) => !q || a.name.includes(q) || a.desc.includes(q));

  useEffect(() => {
    if (!open) return;
    setAnimating(true);
    clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => setAnimating(false), list.length * 40 + 480);
  }, [open, list.length]);

  return (
    <div className={`launcher ${open ? "show" : ""}`}>
      <div className="launcher-panel">
        <input
          className="l-search"
          placeholder="搜索应用…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="l-cats">
          {cats.map((c) => (
            <span key={c} className={`l-chip ${c === cat ? "on" : ""}`} onClick={() => setCat(c)}>
              {c}
            </span>
          ))}
        </div>
        <div className={`l-grid ${animating ? "animating" : ""}`}>
          {list.length === 0 && <div className="l-empty">没有匹配的应用{q ? `「${q}」` : ""}</div>}
          {list.map((a, i) => (
            <div
              key={a.id}
              className="l-app"
              style={{ animationDelay: `${i * 40}ms` }}
              onClick={() => onOpen(a.id)}
            >
              <div className="tile" style={{ background: a.color }}>
                {a.icon}
              </div>
              <div className="nm">{a.name}</div>
              <div className="stk">
                {APP_TAGS[a.id] ?? "App"} · {a.cat}
              </div>
            </div>
          ))}
        </div>
        <div className="l-foot">
          找不到应用？可能未为贵校开通 —— 请管理员到「系统设置 → 模块授权」开通
        </div>
      </div>
    </div>
  );
}
