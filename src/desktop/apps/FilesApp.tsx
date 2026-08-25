import { useRef } from "react";
import { api } from "@/providers/api";
import { useDesktop } from "../DesktopContext";

function formatBytes(size: number | string) {
  const value = Number(size);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function FilesApp() {
  const { toast } = useDesktop();
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = api.useUtils();
  const files = api.file.list.useQuery();
  const upload = api.file.upload.useMutation({
    onSuccess: () => {
      toast("文件已上传 ✅");
      if (inputRef.current) inputRef.current.value = "";
      void utils.file.list.invalidate();
    },
    onError: (error) => toast(error.message),
  });
  const remove = api.file.remove.useMutation({
    onSuccess: () => {
      toast("文件已删除");
      void utils.file.list.invalidate();
    },
    onError: (error) => toast(error.message),
  });
  const download = api.file.download.useMutation({
    onSuccess: ({ downloadUrl }) => window.open(downloadUrl, "_blank", "noopener,noreferrer"),
    onError: (error) => toast(error.message),
  });

  return (
    <div className="app">
      <div className="toolbar">
        <h2 style={{ margin: 0, flex: 1 }}>文件中心</h2>
        <input
          ref={inputRef}
          aria-label="选择文件"
          type="file"
          className="inp"
          style={{ maxWidth: 280 }}
        />
        <button
          type="button"
          className="btn"
          disabled={upload.isPending}
          onClick={() => {
            const file = inputRef.current?.files?.[0];
            if (!file) return toast("请先选择文件");
            upload.mutate(file);
          }}
        >
          {upload.isPending ? "上传中…" : "上传文件"}
        </button>
      </div>
      <div className="sub">文件直传私有对象存储；下载链接仅短时有效，服务端不转发文件正文</div>
      <div className="panel" style={{ padding: "6px 14px" }}>
        <table className="tb">
          <thead>
            <tr>
              <th>文件名</th>
              <th>类型</th>
              <th>大小</th>
              <th>状态</th>
              <th>上传时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {files.data?.map((file) => (
              <tr key={file.id}>
                <td>
                  <b>{file.originalName}</b>
                </td>
                <td>{file.contentType}</td>
                <td>{formatBytes(file.size)}</td>
                <td>
                  <span className={`pill ${file.status === "ready" ? "g" : "y"}`}>
                    {file.status === "ready" ? "可用" : "上传中"}
                  </span>
                </td>
                <td>{new Date(file.createdAt).toLocaleString("zh-CN")}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {file.status === "ready" && (
                    <button
                      type="button"
                      className="link-button"
                      style={{ color: "#5b6ee1" }}
                      onClick={() => download.mutate({ id: file.id })}
                    >
                      下载
                    </button>
                  )}
                  {file.status === "ready" && " · "}
                  <button
                    type="button"
                    className="link-button"
                    style={{ color: "#f43f5e" }}
                    onClick={() => remove.mutate({ id: file.id })}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {files.isLoading && <div className="empty-box">正在加载…</div>}
        {files.data?.length === 0 && <div className="empty-box">暂无文件</div>}
      </div>
    </div>
  );
}
