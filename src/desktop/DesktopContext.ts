import type { Role } from "@contracts/apps";
import { createContext, useContext } from "react";

export interface DesktopCtx {
  toast: (msg: string) => void;
  openApp: (id: string) => void;
  role: Role;
  accountName: string;
  tenantName: string;
  wallpaper: number;
  setWallpaper: (i: number) => void;
  dockAutoHide: boolean;
  setDockAutoHide: (v: boolean) => void;
}

export const Ctx = createContext<DesktopCtx>(null as unknown as DesktopCtx);
export const useDesktop = () => useContext(Ctx);
