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

const calls = {
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

function endpointQuery<I, O>(name: string, call: (input: I) => Promise<O>) {
  return {
    useQuery(input?: I, options?: Omit<UseQueryOptions<O, Error>, "queryKey" | "queryFn">) {
      return useQuery({
        queryKey: [name, input],
        queryFn: () => call(input as I),
        ...options,
      });
    },
  };
}

function endpointMutation<I, O>(name: string, call: (input: I) => Promise<O>) {
  return {
    useMutation(options?: UseMutationOptions<O, Error, I>) {
      return useMutation({ mutationKey: [name], mutationFn: call, ...options });
    },
  };
}

const queryNames = [
  "session.me",
  "dashboard.stats",
  "message.list",
  "system.visibleApps",
  "system.getPrefs",
  "system.listModules",
  "system.listAccounts",
  "exam.list",
  "exam.questions",
  "exam.take",
  "exam.results",
  "grade.examStats",
  "grade.myGrades",
  "file.list",
] as const;

export const api = {
  session: {
    me: endpointQuery<void, SessionMe>("session.me", calls.session.me),
    login: endpointMutation("session.login", calls.session.login),
    logout: endpointMutation<void, { success: boolean }>("session.logout", calls.session.logout),
  },
  dashboard: {
    stats: endpointQuery<void, DashboardStats>("dashboard.stats", calls.dashboard.stats),
  },
  message: {
    list: endpointQuery<void, Message[]>("message.list", calls.message.list),
    publish: endpointMutation("message.publish", calls.message.publish),
  },
  system: {
    visibleApps: endpointQuery<void, VisibleApp[]>("system.visibleApps", calls.system.visibleApps),
    getPrefs: endpointQuery<void, Prefs>("system.getPrefs", calls.system.getPrefs),
    setPrefs: endpointMutation("system.setPrefs", calls.system.setPrefs),
    listModules: endpointQuery<void, Module[]>("system.listModules", calls.system.listModules),
    setModule: endpointMutation("system.setModule", calls.system.setModule),
    listAccounts: endpointQuery<void, Account[]>("system.listAccounts", calls.system.listAccounts),
    createAccount: endpointMutation("system.createAccount", calls.system.createAccount),
  },
  exam: {
    list: endpointQuery<void, ExamListItem[]>("exam.list", calls.exam.list),
    create: endpointMutation("exam.create", calls.exam.create),
    remove: endpointMutation("exam.remove", calls.exam.remove),
    publish: endpointMutation("exam.publish", calls.exam.publish),
    questions: endpointQuery("exam.questions", calls.exam.questions),
    addQuestion: endpointMutation("exam.addQuestion", calls.exam.addQuestion),
    removeQuestion: endpointMutation("exam.removeQuestion", calls.exam.removeQuestion),
    take: endpointQuery("exam.take", calls.exam.take),
    submit: endpointMutation("exam.submit", calls.exam.submit),
    results: endpointQuery("exam.results", calls.exam.results),
  },
  grade: {
    examStats: endpointQuery("grade.examStats", calls.grade.examStats),
    myGrades: endpointQuery<void, MyGrades>("grade.myGrades", calls.grade.myGrades),
  },
  file: {
    list: endpointQuery<void, FileEntry[]>("file.list", calls.file.list),
    upload: endpointMutation("file.upload", calls.file.upload),
    download: endpointMutation("file.download", calls.file.download),
    remove: endpointMutation("file.remove", calls.file.remove),
  },
  useUtils() {
    const queryClient = useQueryClient();
    const invalidate = (name?: string) =>
      queryClient.invalidateQueries(name ? { queryKey: [name] } : undefined);
    const endpoint = (name: string) => ({
      invalidate: (_input?: unknown) => invalidate(name),
    });
    return {
      invalidate: () => invalidate(),
      session: { me: endpoint("session.me") },
      dashboard: { stats: endpoint("dashboard.stats") },
      message: { list: endpoint("message.list") },
      system: {
        visibleApps: endpoint("system.visibleApps"),
        getPrefs: endpoint("system.getPrefs"),
        listModules: endpoint("system.listModules"),
        listAccounts: endpoint("system.listAccounts"),
      },
      exam: {
        list: endpoint("exam.list"),
        questions: endpoint("exam.questions"),
        results: endpoint("exam.results"),
      },
      grade: {
        examStats: endpoint("grade.examStats"),
        myGrades: endpoint("grade.myGrades"),
      },
      file: { list: endpoint("file.list") },
    };
  },
};

const invalidations: Record<EventType, string[]> = {
  "announcement.created": ["message.list", "dashboard.stats"],
  "exam.created": ["exam.list", "dashboard.stats"],
  "exam.updated": ["exam.list", "exam.questions", "grade.examStats"],
  "exam.published": ["exam.list", "dashboard.stats"],
  "exam.deleted": ["exam.list", "dashboard.stats"],
  "exam.submitted": [
    "exam.list",
    "exam.results",
    "grade.examStats",
    "grade.myGrades",
    "dashboard.stats",
  ],
  "module.updated": ["system.visibleApps", "system.listModules"],
  "prefs.updated": ["system.getPrefs"],
  "account.created": ["system.listAccounts", "dashboard.stats"],
  "file.upload-requested": ["file.list"],
  "file.ready": ["file.list"],
  "file.deleted": ["file.list"],
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
      for (const key of invalidations[parsed.data.type])
        void queryClient.invalidateQueries({ queryKey: [key] });
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

export function ApiProvider({ children }: { children: ReactNode }) {
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

void queryNames;
