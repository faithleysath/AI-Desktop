import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, useLoginMutation, useLogoutMutation, useSessionQuery } from "@/providers/api";

/** 校园账号会话（管理员/教师/学生） */
export function useSession() {
  const queryClient = useQueryClient();
  const me = useSessionQuery({
    retry: false,
    staleTime: 30_000,
  });

  const login = useLoginMutation({
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.session }),
        queryClient.invalidateQueries({ queryKey: queryKeys.visibleApps }),
        queryClient.invalidateQueries({ queryKey: queryKeys.preferences }),
      ]);
    },
  });

  const logout = useLogoutMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries();
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
