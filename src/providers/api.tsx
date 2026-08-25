import {
  QueryClient,
  QueryClientProvider,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { hc } from "hono/client";
import { type ReactNode, useEffect, useRef } from "react";
import { type EventType, realtimeEventSchema } from "../../contracts/realtime";
import type { AppType } from "../../server/app";

const client = hc<AppType>(window.location.origin, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, credentials: "include" }),
});

async function unwrap<T>(response: {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String(data.message)
        : `请求失败 (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

const requests = {
  session: {
    me: async () => unwrap<SessionMe>(await client.api.session.me.$get()),
    login: async (input: { username: string; password: string }) => {
      await unwrap<unknown>(await client.api.session.login.$post({ json: input }));
      return { success: true };
    },
    logout: async () => {
      await unwrap<unknown>(await client.api.session.logout.$post());
      return { success: true };
    },
  },
  dashboard: {
    stats: async () => unwrap<DashboardStats>(await client.api.dashboard.stats.$get()),
  },
  message: {
    list: async () => unwrap<Message[]>(await client.api.messages.$get()),
    publish: async (input: { title: string; content: string }) =>
      unwrap<Message>(await client.api.messages.$post({ json: input })),
  },
  system: {
    visibleApps: async () => unwrap<VisibleApp[]>(await client.api.system.apps.$get()),
    getPrefs: async () => unwrap<Prefs>(await client.api.system.prefs.$get()),
    setPrefs: async (input: Partial<Prefs>) =>
      unwrap<{ success: boolean }>(await client.api.system.prefs.$put({ json: input })),
    listModules: async () => unwrap<Module[]>(await client.api.system.modules.$get()),
    setModule: async (input: { moduleId: string; enabled: boolean }) =>
      unwrap<{ success: boolean }>(
        await client.api.system.modules[":id"].$put({
          param: { id: input.moduleId },
          json: { enabled: input.enabled },
        }),
      ),
    listAccounts: async () => unwrap<Account[]>(await client.api.system.accounts.$get()),
    createAccount: async (input: CreateAccountInput) =>
      unwrap<{ success: boolean; id: string }>(
        await client.api.system.accounts.$post({ json: input }),
      ),
  },
  exam: {
    list: async () => unwrap<ExamListItem[]>(await client.api.exams.$get()),
    create: async (input: CreateExamInput) =>
      unwrap<{ id: string }>(await client.api.exams.$post({ json: input })),
    remove: async (input: { examId: string }) =>
      unwrap<{ success: boolean }>(
        await client.api.exams[":id"].$delete({ param: { id: input.examId } }),
      ),
    publish: async (input: { examId: string }) =>
      unwrap<{ success: boolean }>(
        await client.api.exams[":examId"].publish.$post({
          param: { examId: input.examId },
        }),
      ),
    questions: async (input: { examId: string }) =>
      unwrap<Question[]>(await client.api.exams[":examId"].questions.$get({ param: input })),
    addQuestion: async (input: AddQuestionInput) => {
      const { examId, ...json } = input;
      return unwrap<{ success: boolean }>(
        await client.api.exams[":examId"].questions.$post({
          param: { examId },
          json,
        }),
      );
    },
    removeQuestion: async (input: { questionId: string }) =>
      unwrap<{ success: boolean }>(
        await client.api.questions[":id"].$delete({
          param: { id: input.questionId },
        }),
      ),
    take: async (input: { examId: string }) =>
      unwrap<{ exam: Exam; questions: TakeQuestion[] }>(
        await client.api.exams[":examId"].take.$get({ param: input }),
      ),
    submit: async (input: { examId: string; answers: Record<string, Option> }) =>
      unwrap<{ score: number; totalScore: number }>(
        await client.api.exams[":examId"].submit.$post({
          param: { examId: input.examId },
          json: { answers: input.answers },
        }),
      ),
    results: async (input: { examId: string }) =>
      unwrap<{ exam: Exam; rows: ResultRow[] }>(
        await client.api.exams[":examId"].results.$get({ param: input }),
      ),
  },
  grade: {
    examStats: async (input: { examId: string }) =>
      unwrap<ExamStats>(await client.api.grades.exams[":examId"].$get({ param: input })),
    myGrades: async () => unwrap<MyGrades>(await client.api.grades.mine.$get()),
  },
  file: {
    list: async () => unwrap<FileEntry[]>(await client.api.files.$get()),
    upload: async (file: File) => {
      const created = await unwrap<{ file: FileEntry; uploadUrl: string }>(
        await client.api.files["upload-url"].$post({
          json: {
            originalName: file.name,
            contentType: file.type || "application/octet-stream",
            size: file.size,
          },
        }),
      );
      const uploaded = await fetch(created.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploaded.ok) throw new Error(`对象存储上传失败 (${uploaded.status})`);
      await unwrap<{ success: boolean }>(
        await client.api.files[":id"].complete.$post({
          param: { id: created.file.id },
        }),
      );
      return created.file;
    },
    download: async (input: { id: string }) =>
      unwrap<{ downloadUrl: string; expiresIn: number }>(
        await client.api.files[":id"]["download-url"].$get({ param: input }),
      ),
    remove: async (input: { id: string }) =>
      unwrap<{ success: boolean }>(await client.api.files[":id"].$delete({ param: input })),
  },
};

type QueryOptions<T> = Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">;
type MutationOptions<I, O> = Omit<UseMutationOptions<O, Error, I>, "mutationKey" | "mutationFn">;

export const queryKeys = {
  session: ["session"] as const,
  dashboard: ["dashboard"] as const,
  messages: ["messages"] as const,
  visibleApps: ["system", "apps"] as const,
  preferences: ["system", "preferences"] as const,
  modules: ["system", "modules"] as const,
  accounts: ["system", "accounts"] as const,
  exams: ["exams"] as const,
  examQuestions: (examId?: string) =>
    examId ? (["exams", "questions", examId] as const) : (["exams", "questions"] as const),
  examTake: (examId: string) => ["exams", "take", examId] as const,
  examResults: (examId?: string) =>
    examId ? (["exams", "results", examId] as const) : (["exams", "results"] as const),
  examStats: (examId?: string) =>
    examId ? (["grades", "exams", examId] as const) : (["grades", "exams"] as const),
  myGrades: ["grades", "mine"] as const,
  files: ["files"] as const,
};

export function useSessionQuery(options?: QueryOptions<SessionMe>) {
  return useQuery({ queryKey: queryKeys.session, queryFn: requests.session.me, ...options });
}

export function useLoginMutation(
  options?: MutationOptions<{ username: string; password: string }, { success: boolean }>,
) {
  return useMutation({
    mutationKey: ["session", "login"],
    mutationFn: requests.session.login,
    ...options,
  });
}

export function useLogoutMutation(options?: MutationOptions<void, { success: boolean }>) {
  return useMutation({
    mutationKey: ["session", "logout"],
    mutationFn: requests.session.logout,
    ...options,
  });
}

export function useDashboardStatsQuery(options?: QueryOptions<DashboardStats>) {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: requests.dashboard.stats, ...options });
}

export function useMessagesQuery(options?: QueryOptions<Message[]>) {
  return useQuery({ queryKey: queryKeys.messages, queryFn: requests.message.list, ...options });
}

export function usePublishMessageMutation(
  options?: MutationOptions<{ title: string; content: string }, Message>,
) {
  return useMutation({
    mutationKey: ["messages", "publish"],
    mutationFn: requests.message.publish,
    ...options,
  });
}

export function useVisibleAppsQuery(options?: QueryOptions<VisibleApp[]>) {
  return useQuery({
    queryKey: queryKeys.visibleApps,
    queryFn: requests.system.visibleApps,
    ...options,
  });
}

export function usePreferencesQuery(options?: QueryOptions<Prefs>) {
  return useQuery({
    queryKey: queryKeys.preferences,
    queryFn: requests.system.getPrefs,
    ...options,
  });
}

export function useSetPreferencesMutation(
  options?: MutationOptions<Partial<Prefs>, { success: boolean }>,
) {
  return useMutation({
    mutationKey: ["system", "preferences", "update"],
    mutationFn: requests.system.setPrefs,
    ...options,
  });
}

export function useModulesQuery(options?: QueryOptions<Module[]>) {
  return useQuery({
    queryKey: queryKeys.modules,
    queryFn: requests.system.listModules,
    ...options,
  });
}

export function useSetModuleMutation(
  options?: MutationOptions<{ moduleId: string; enabled: boolean }, { success: boolean }>,
) {
  return useMutation({
    mutationKey: ["system", "modules", "update"],
    mutationFn: requests.system.setModule,
    ...options,
  });
}

export function useAccountsQuery(options?: QueryOptions<Account[]>) {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: requests.system.listAccounts,
    ...options,
  });
}

export function useCreateAccountMutation(
  options?: MutationOptions<CreateAccountInput, { success: boolean; id: string }>,
) {
  return useMutation({
    mutationKey: ["system", "accounts", "create"],
    mutationFn: requests.system.createAccount,
    ...options,
  });
}

export function useExamsQuery(options?: QueryOptions<ExamListItem[]>) {
  return useQuery({ queryKey: queryKeys.exams, queryFn: requests.exam.list, ...options });
}

export function useCreateExamMutation(options?: MutationOptions<CreateExamInput, { id: string }>) {
  return useMutation({
    mutationKey: ["exams", "create"],
    mutationFn: requests.exam.create,
    ...options,
  });
}

export function useRemoveExamMutation(
  options?: MutationOptions<{ examId: string }, { success: boolean }>,
) {
  return useMutation({
    mutationKey: ["exams", "remove"],
    mutationFn: requests.exam.remove,
    ...options,
  });
}

export function usePublishExamMutation(
  options?: MutationOptions<{ examId: string }, { success: boolean }>,
) {
  return useMutation({
    mutationKey: ["exams", "publish"],
    mutationFn: requests.exam.publish,
    ...options,
  });
}

export function useExamQuestionsQuery(examId: string, options?: QueryOptions<Question[]>) {
  return useQuery({
    queryKey: queryKeys.examQuestions(examId),
    queryFn: () => requests.exam.questions({ examId }),
    ...options,
  });
}

export function useAddQuestionMutation(
  options?: MutationOptions<AddQuestionInput, { success: boolean }>,
) {
  return useMutation({
    mutationKey: ["exams", "questions", "add"],
    mutationFn: requests.exam.addQuestion,
    ...options,
  });
}

export function useRemoveQuestionMutation(
  options?: MutationOptions<{ questionId: string }, { success: boolean }>,
) {
  return useMutation({
    mutationKey: ["exams", "questions", "remove"],
    mutationFn: requests.exam.removeQuestion,
    ...options,
  });
}

export function useTakeExamQuery(
  examId: string,
  options?: QueryOptions<{ exam: Exam; questions: TakeQuestion[] }>,
) {
  return useQuery({
    queryKey: queryKeys.examTake(examId),
    queryFn: () => requests.exam.take({ examId }),
    ...options,
  });
}

export function useSubmitExamMutation(
  options?: MutationOptions<
    { examId: string; answers: Record<string, Option> },
    { score: number; totalScore: number }
  >,
) {
  return useMutation({
    mutationKey: ["exams", "submit"],
    mutationFn: requests.exam.submit,
    ...options,
  });
}

export function useExamResultsQuery(
  examId: string,
  options?: QueryOptions<{ exam: Exam; rows: ResultRow[] }>,
) {
  return useQuery({
    queryKey: queryKeys.examResults(examId),
    queryFn: () => requests.exam.results({ examId }),
    ...options,
  });
}

export function useExamStatsQuery(examId: string, options?: QueryOptions<ExamStats>) {
  return useQuery({
    queryKey: queryKeys.examStats(examId),
    queryFn: () => requests.grade.examStats({ examId }),
    ...options,
  });
}

export function useMyGradesQuery(options?: QueryOptions<MyGrades>) {
  return useQuery({ queryKey: queryKeys.myGrades, queryFn: requests.grade.myGrades, ...options });
}

export function useFilesQuery(options?: QueryOptions<FileEntry[]>) {
  return useQuery({ queryKey: queryKeys.files, queryFn: requests.file.list, ...options });
}

export function useUploadFileMutation(options?: MutationOptions<File, FileEntry>) {
  return useMutation({
    mutationKey: ["files", "upload"],
    mutationFn: requests.file.upload,
    ...options,
  });
}

export function useDownloadFileMutation(
  options?: MutationOptions<{ id: string }, { downloadUrl: string; expiresIn: number }>,
) {
  return useMutation({
    mutationKey: ["files", "download"],
    mutationFn: requests.file.download,
    ...options,
  });
}

export function useRemoveFileMutation(
  options?: MutationOptions<{ id: string }, { success: boolean }>,
) {
  return useMutation({
    mutationKey: ["files", "remove"],
    mutationFn: requests.file.remove,
    ...options,
  });
}

const invalidations: Record<EventType, readonly (readonly string[])[]> = {
  "announcement.created": [queryKeys.messages, queryKeys.dashboard],
  "exam.created": [queryKeys.exams, queryKeys.dashboard],
  "exam.updated": [queryKeys.exams, queryKeys.examQuestions(), queryKeys.examStats()],
  "exam.published": [queryKeys.exams, queryKeys.dashboard],
  "exam.deleted": [queryKeys.exams, queryKeys.dashboard],
  "exam.submitted": [
    queryKeys.exams,
    queryKeys.examResults(),
    queryKeys.examStats(),
    queryKeys.myGrades,
    queryKeys.dashboard,
  ],
  "module.updated": [queryKeys.visibleApps, queryKeys.modules],
  "prefs.updated": [queryKeys.preferences],
  "account.created": [queryKeys.accounts, queryKeys.dashboard],
  "file.upload-requested": [queryKeys.files],
  "file.ready": [queryKeys.files],
  "file.deleted": [queryKeys.files],
};

function RealtimeInvalidator() {
  const queryClient = useQueryClient();
  const cursor = useRef(0);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    let socket: WebSocket | undefined;
    let stopped = false;
    let retryMs = 500;
    const apply = (value: unknown) => {
      const parsed = realtimeEventSchema.safeParse(value);
      if (!parsed.success) return;
      if (seen.current.has(parsed.data.id)) return;
      seen.current.add(parsed.data.id);
      if (seen.current.size > 1_000) {
        const oldest = seen.current.values().next().value;
        if (oldest) seen.current.delete(oldest);
      }
      cursor.current = Math.max(cursor.current, Number(parsed.data.sequence));
      for (const queryKey of invalidations[parsed.data.type])
        void queryClient.invalidateQueries({ queryKey });
    };
    const scheduleReconnect = () => {
      if (stopped) return;
      window.setTimeout(() => void connect(), retryMs);
      retryMs = Math.min(retryMs * 2, 10_000);
    };
    const connect = async () => {
      if (stopped) return;
      try {
        const catchup = await client.api.realtime.events.$get({
          query: { after: String(cursor.current) },
        });
        if (catchup.ok) for (const event of await catchup.json()) apply(event);
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime`);
        socket.onopen = () => {
          retryMs = 500;
        };
        socket.onmessage = (message) => {
          try {
            apply(JSON.parse(String(message.data)));
          } catch {
            /* ignore non-event control frames */
          }
        };
        socket.onclose = scheduleReconnect;
      } catch {
        scheduleReconnect();
      }
    };
    void connect();
    return () => {
      stopped = true;
      socket?.close();
    };
  }, [queryClient]);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

export function DataProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeInvalidator />
      {children}
    </QueryClientProvider>
  );
}

type Option = "A" | "B" | "C" | "D";
type Role = "admin" | "teacher" | "student";
interface SessionMe {
  account: {
    id: string;
    username: string;
    name: string;
    email: string;
    role: Role;
    organizationId: string;
    tenantId: string;
  };
  tenant: { id: string; name: string; slug: string };
}
interface Message {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  authorName: string;
}
interface DashboardStats {
  studentCount: number;
  teacherCount: number;
  monthExams: number;
  todoCount: number;
  todoLabel: string;
  trend: number[];
  recent: Message[];
}
interface VisibleApp {
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
interface Prefs {
  wallpaper: number;
  dockAutoHide: boolean;
}
interface Module extends VisibleApp {
  enabled: boolean;
}
interface Account {
  id: string;
  username: string | null;
  name: string;
  role: Role;
  createdAt: string;
}
interface CreateAccountInput {
  username: string;
  password: string;
  name: string;
  role: Role;
}
interface Exam {
  id: string;
  organizationId: string;
  title: string;
  gradeLabel: string;
  subject: string;
  status: "draft" | "published";
  startAt: string;
  endAt: string;
  createdBy: string;
  createdAt: string;
}
interface ExamListItem extends Exam {
  questionCount: number;
  submissionCount: number;
  my: { score: number; totalScore: number } | null;
}
interface CreateExamInput {
  title: string;
  gradeLabel: string;
  subject: string;
  startAt: Date | string;
  endAt: Date | string;
}
interface Question {
  id: string;
  examId: string;
  idx: number;
  stem: string;
  options: string[];
  answer: Option;
  score: number;
}
interface TakeQuestion {
  id: string;
  idx: number;
  stem: string;
  options: string[];
  score: number;
}
interface AddQuestionInput {
  examId: string;
  stem: string;
  options: string[];
  answer: Option;
  score: number;
}
interface ResultRow {
  id: string;
  score: number;
  totalScore: number;
  submittedAt: string;
  studentName: string;
  studentUsername: string | null;
}
interface ExamStats {
  exam: Exam;
  count: number;
  totalScore: number;
  avg: number;
  max: number;
  min: number;
  passRate: number;
  buckets: number[];
  perQuestion: Array<{ idx: number; stem: string; accuracy: number }>;
}
interface MyGrades {
  rows: Array<{
    id: string;
    score: number;
    totalScore: number;
    submittedAt: string;
    examTitle: string;
    subject: string;
    gradeLabel: string;
  }>;
  avgPct: number;
}
interface FileEntry {
  id: string;
  organizationId: string;
  ownerId: string;
  objectKey: string;
  originalName: string;
  contentType: string;
  size: number | string;
  checksum: string | null;
  etag: string | null;
  status: "pending" | "ready" | "rejected" | "deleted";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
