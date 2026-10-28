"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useApp } from "@/components/providers";
import { Empty, ErrorPanel, Loading } from "@/components/ui";
import { useTasks } from "./provider";
import { TaskCard } from "./cards";
import type { PageResponse, TaskDto, TaskStatus } from "@/lib/api/contracts";

export function History() {
  const { auth } = useApp();
  return <HistoryContent key={`${auth.user?.id ?? "anonymous"}:${auth.revision}`} />;
}
function HistoryContent() {
  const { api, auth, registry } = useApp(); const tasks = useTasks(); const [page, setPage] = useState(1); const [status, setStatus] = useState<TaskStatus | "">("");
  const enabled = auth.status === "ready" && !!auth.user;
  const history = useQuery({ queryKey: ["tasks", auth.user?.id ?? "anonymous", "history", page, status], enabled, staleTime: 0,
    queryFn: async ({ signal }) => {
      const scope = api.scope; const result = await api.request<PageResponse<TaskDto>>(`/api/tasks?page=${page}&pageSize=12${status ? "&status=" + status : ""}`, { signal });
      if (scope === api.scope) result.items.forEach(task => registry.record(task));
      return result;
    },
  });
  if (auth.status === "loading" || auth.status === "changing") return <Loading text="确认账户并加载作品…" />;
  if (!auth.user) return <Empty title="登录后查看你的作品"><p className="muted">个人记录、制作进度与结果会一直保存在账户中。</p><Link href="/login?returnTo=%2Ftasks" className="button primary">前往登录</Link></Empty>;
  if (auth.status === "error") return <ErrorPanel error={auth.error} title="账户状态暂未确认" />;
  return <><div className="page-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h1>我的作品</h1><p className="muted">每一次创作，都值得留下。{tasks.pending > 0 ? `当前有 ${tasks.pending} 个任务正在处理。` : ""}</p></div><Link className="button primary" href="/">继续创作 <span aria-hidden="true">＋</span></Link></div>
    <div className="history-toolbar"><label htmlFor="task-status">任务状态</label><select id="task-status" value={status} onChange={event => { setStatus(event.target.value as TaskStatus | ""); setPage(1); }}><option value="">全部状态</option><option value="QUEUED">等待处理</option><option value="RUNNING">制作中</option><option value="SUCCEEDED">制作完成</option><option value="FAILED">制作失败</option></select><button className="button secondary small" onClick={() => { tasks.refresh(); void history.refetch(); }}>刷新记录</button></div>
    {tasks.discoveryError && <ErrorPanel error={tasks.discoveryError} title="任务自动发现暂时不可用" retry={tasks.refresh} />}
    {history.isError && history.data && <ErrorPanel error={history.error} title="记录暂时无法更新，已保留上次数据" retry={() => void history.refetch()} />}
    {!history.data ? history.isError ? <ErrorPanel error={history.error} retry={() => void history.refetch()} /> : <Loading text="加载个人作品…" /> : !history.data.items.length ? <Empty title="这里还没有作品"><p className="muted">从一个模板开始，留住你的创作灵感。</p><Link className="button secondary" href="/">浏览模板</Link></Empty> : <>
      <div className="task-grid history-grid">{history.data.items.map(item => { const task = tasks.tasks.find(task => task.id === item.id) ?? item; return <TaskCard key={task.id} task={task} error={tasks.errors.get(task.id)} retry={() => tasks.retry(task.id)} />; })}</div>
      <div className="pagination"><button className="button secondary small" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>第 {page} 页 · 共 {history.data.total} 条</span><button className="button secondary small" disabled={page * 12 >= history.data.total} onClick={() => setPage(page + 1)}>下一页</button></div>
    </>}
  </>;
}
