import { trpc } from "@/providers/trpc";

/** 校园账号会话（管理员/教师/学生） */
export function useSession() {
  const utils = trpc.useUtils();
  const me = trpc.session.me.useQuery(undefined, { retry: false, staleTime: 30_000 });

  const login = trpc.session.login.useMutation({
    onSuccess: async () => {
      await utils.session.me.invalidate();
      await utils.system.visibleApps.invalidate();
      await utils.system.getPrefs.invalidate();
    },
  });

  const logout = trpc.session.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
    },
  });

  return {
    account: me.data?.account ?? null,
    tenant: me.data?.tenant ?? null,
    loading: me.isLoading,
    login,
    logout,
  };
}
