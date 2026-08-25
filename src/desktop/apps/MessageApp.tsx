import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { queryKeys, useMessagesQuery, usePublishMessageMutation } from "@/providers/api";
import { useDesktop } from "../DesktopContext";

export default function MessageApp() {
  const { role, toast } = useDesktop();
  const canPublish = role === "admin" || role === "teacher";
  const queryClient = useQueryClient();
  const list = useMessagesQuery();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [showForm, setShowForm] = useState(false);

  const publish = usePublishMessageMutation({
    onSuccess: () => {
      toast("公告已发布 ✅");
      setTitle("");
      setContent("");
      setShowForm(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
    onError: (e) => toast(e.message),
  });

  const AVS = ["#eef0f8", "#e7f6f0", "#fdeef0", "#fef4e2"];

  return (
    <div className="app">
      <div className="toolbar">
        <h2 style={{ flex: 1, margin: 0 }}>校务消息</h2>
        {canPublish && (
          <button type="button" className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "取消" : "+ 发布公告"}
          </button>
        )}
      </div>
      {showForm && canPublish && (
        <div className="panel">
          <div className="ph">发布新公告</div>
          <div className="form-row">
            <input
              className="inp"
              placeholder="公告标题…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="form-row">
            <textarea
              className="inp"
              rows={3}
              style={{
                width: "100%",
                resize: "vertical",
                fontFamily: "inherit",
              }}
              placeholder="公告内容…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn"
            disabled={publish.isPending || !title.trim() || !content.trim()}
            onClick={() => publish.mutate({ title: title.trim(), content: content.trim() })}
          >
            {publish.isPending ? "发布中…" : "确认发布"}
          </button>
        </div>
      )}
      {list.isLoading && <div className="empty-box">正在加载…</div>}
      {list.data?.length === 0 && <div className="empty-box">暂无公告</div>}
      {list.data?.map((m, i) => (
        <div className="msg" key={m.id}>
          <div className="av" style={{ background: AVS[i % AVS.length] }}>
            📢
          </div>
          <div style={{ flex: 1 }}>
            <div className="mt">{m.title}</div>
            <div className="ms">{m.content}</div>
            <div className="ms" style={{ marginTop: 5, color: "#a0a5b8" }}>
              {m.authorName} ·{" "}
              {new Date(m.createdAt).toLocaleString("zh-CN", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>
      ))}
      <div style={{ fontSize: 12, color: "#a0a5b8", marginTop: 6 }}>
        {canPublish ? "教师与管理员可发布公告" : "公告由教师或管理员发布"}
      </div>
    </div>
  );
}
