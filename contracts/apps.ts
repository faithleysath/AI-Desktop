/** 角色与模块目录 —— 前后端共享 */
export type Role = "admin" | "teacher" | "student";

export interface AppManifest {
  id: string;
  name: string;
  icon: string;
  color: string;
  cat: "教学" | "管理" | "系统";
  desc: string;
  w: number;
  h: number;
  roles: Role[];
}

/** 应用注册清单：桌面/启动器/任务栏全部由它驱动；服务端按「租户 License × 角色」过滤后下发 */
export const APP_CATALOG: AppManifest[] = [
  {
    id: "dashboard",
    name: "数据看板",
    icon: "📊",
    color: "linear-gradient(135deg,#5b8cff,#7c5cff)",
    cat: "教学",
    desc: "全校核心数据一屏总览",
    w: 860,
    h: 580,
    roles: ["admin", "teacher", "student"],
  },
  {
    id: "exam",
    name: "考试管理",
    icon: "📝",
    color: "linear-gradient(135deg,#22c1a3,#3ddc84)",
    cat: "教学",
    desc: "考试安排、出题与在线作答",
    w: 980,
    h: 640,
    roles: ["admin", "teacher", "student"],
  },
  {
    id: "grade",
    name: "成绩分析",
    icon: "📈",
    color: "linear-gradient(135deg,#ff9a5c,#ff6a88)",
    cat: "教学",
    desc: "成绩统计与趋势分析",
    w: 900,
    h: 600,
    roles: ["admin", "teacher", "student"],
  },
  {
    id: "message",
    name: "校务消息",
    icon: "💬",
    color: "linear-gradient(135deg,#f857a6,#ff7a59)",
    cat: "管理",
    desc: "通知公告与消息",
    w: 720,
    h: 560,
    roles: ["admin", "teacher", "student"],
  },
  {
    id: "files",
    name: "文件中心",
    icon: "📁",
    color: "linear-gradient(135deg,#00a8cc,#6dd5ed)",
    cat: "管理",
    desc: "私有文件上传、下载与管理",
    w: 820,
    h: 580,
    roles: ["admin", "teacher", "student"],
  },
  {
    id: "settings",
    name: "系统设置",
    icon: "⚙️",
    color: "linear-gradient(135deg,#5f6b7d,#9aa7bd)",
    cat: "系统",
    desc: "通用、用户与模块授权",
    w: 880,
    h: 600,
    roles: ["admin", "teacher", "student"],
  },
];

export const ROLE_NAMES: Record<Role, string> = {
  admin: "管理员",
  teacher: "教师",
  student: "学生",
};
