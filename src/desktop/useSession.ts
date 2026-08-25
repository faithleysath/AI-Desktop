import { api } from "@/providers/api";

/** 校园账号会话（管理员/教师/学生） */
export function useSession() {
  const utils = api.useUtils();
  const me = api.session.me.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });

  const login = api.session.login.useMutation({
    onSuccess: async () => {
      await utils.session.me.invalidate();
      await utils.system.visibleApps.invalidate();
      await utils.system.getPrefs.invalidate();
    },
  });

  const logout = api.session.logout.useMutation({
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
