"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useApp } from "@/components/providers";
import { Dialog, Empty, ErrorPanel, Loading } from "@/components/ui";
import { useTasks } from "./provider";
import type { TaskDto } from "@/lib/api/contracts";

const statusLabels = { QUEUED: "等待处理", RUNNING: "制作中", SUCCEEDED: "制作完成", FAILED: "制作失败" };
const stageLabels = { MATERIAL_CHECK: "素材检查", GENERATE: "模拟生成", FINALIZE: "结果整理" };
export function TaskCard({ task, error, retry }: { task: TaskDto; error?: Error; retry?: () => void }) {
  const [preview, setPreview] = useState(false);
  return <article className="task-card panel" aria-label={`${task.templateTitle} ${statusLabels[task.status]}`}>
    <div className="task-card-top"><span className={`status-dot ${task.status.toLowerCase()}`} aria-hidden="true" /><h3>{task.templateTitle}</h3><span className={`badge ${task.status.toLowerCase()}`}>{statusLabels[task.status]}</span></div>
    <p className="task-date"><time dateTime={task.createdAt}>{new Date(task.createdAt).toLocaleString("zh-CN", { hour12: false })}</time><span>编号 {task.id.slice(0, 8)}</span></p>
    <ol className="task-steps">{task.steps.map(step => <li key={step.stage} className={step.status.toLowerCase()}><span className="step-marker" aria-hidden="true">{step.status === "SUCCEEDED" ? "✓" : step.status === "FAILED" ? "!" : "·"}</span><span>{stageLabels[step.stage]}</span><small>{step.status === "PENDING" ? task.status === "FAILED" ? "未执行" : "等待" : step.status === "RUNNING" ? "处理中" : step.status === "SUCCEEDED" ? "完成" : "失败"}</small></li>)}</ol>
    {task.status === "QUEUED" && <p className="muted task-message">任务已受理，排队期间可以继续制作。</p>}
    {task.status === "RUNNING" && <p className="muted task-message" role="status">正在{task.currentStage ? stageLabels[task.currentStage] : "制作"}，可以离开此页面。</p>}
    {task.status === "FAILED" && <p className="form-error task-message">{task.errorMessage}</p>}
    {task.status === "SUCCEEDED" && task.resultUrl && <button className="result-thumbnail" onClick={() => setPreview(true)} aria-label={`预览${task.templateTitle}制作结果`}><Image src={task.resultUrl} alt={task.templateTitle + "制作结果"} width={320} height={180} unoptimized /><span>预览结果 <span aria-hidden="true">↗</span></span></button>}
    {error && <div className="query-warning" role="alert"><p>暂时无法更新，已保留上次任务状态。</p><button className="button secondary small" onClick={retry}>恢复查询</button></div>}
    {preview && task.resultUrl && <Dialog title={task.templateTitle + " · 制作结果"} close={() => setPreview(false)}><ResultImage key={task.id} task={task} /></Dialog>}
  </article>;
}
function ResultImage({ task }: { task: TaskDto }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="state-panel" role="alert">图片暂时无法加载。制作状态保持成功，请关闭后重新预览。</div> : <Image className="result-image" src={task.resultUrl!} alt={task.templateTitle + "制作结果"} width={1600} height={1200} unoptimized onError={() => setFailed(true)} />;
}
export function TasksPanel({ templateId }: { templateId?: string }) {
  const { auth } = useApp(); const { tasks, loading, discoveryError, errors, retry, refresh } = useTasks();
  const visible = (templateId ? tasks.filter(task => task.templateId === templateId) : tasks).slice(0, 12);
  return <section className="tasks-panel" aria-label="制作记录"><div className="section-heading"><div><h2>制作记录</h2><p className="muted">后台继续制作，创作不必停下来。</p></div><button className="button subtle small" onClick={refresh} disabled={!auth.user || auth.status !== "ready"}>刷新</button></div>
    {auth.status === "loading" || auth.status === "changing" ? <Loading text="正在确认账户…" /> : !auth.user ? <Empty title="登录后查看你的制作记录"><p className="muted">每一次创作，都会保存在你的账户中。</p><Link className="button secondary" href={`/login?returnTo=${encodeURIComponent(templateId ? "/templates/" + templateId : "/tasks")}`}>前往登录</Link></Empty> : auth.status === "error" ? <p className="state-panel">请先重新确认账户状态。</p> : <>
      {discoveryError && <ErrorPanel error={discoveryError} title="记录更新暂停" retry={refresh} />}
      {loading && !visible.length ? <Loading text="加载制作记录…" /> : !visible.length ? !discoveryError && <Empty title="第一份灵感，从这里开始"><p className="muted">上传图片并提交后，进度和结果会出现在这里。</p></Empty> : <div className="task-grid">{visible.map(task => <TaskCard key={task.id} task={task} error={errors.get(task.id)} retry={() => retry(task.id)} />)}</div>}
      <Link className="all-tasks-link" href="/tasks">查看全部作品 <span aria-hidden="true">→</span></Link>
    </>}
  </section>;
}
