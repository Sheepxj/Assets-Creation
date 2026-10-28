"use client";

import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useId, useState, useEffect, useSyncExternalStore } from "react";
import { useApp } from "@/components/providers";
import { ErrorPanel, Loading } from "@/components/ui";
import { useTasks } from "@/features/tasks/provider";
import { TasksPanel } from "@/features/tasks/cards";
import { UploadSession, type UploadSlot } from "@/features/upload/upload-session";
import { Submission } from "@/features/upload/submission";
import { failureMessage } from "@/lib/api/client";
import type { TemplateDto } from "@/lib/api/contracts";
import { fileSize, imageTypes } from "@/lib/format";

export function TemplateDetail({ id }: { id: string }) {
  const { api, auth } = useApp();
  const template = useQuery({ queryKey: ["templates", "detail", id], queryFn: ({ signal }) => api.request<TemplateDto>("/api/templates/" + encodeURIComponent(id), { signal }) });
  if (template.isPending) return <Loading text="正在加载模板…" />;
  if (template.isError) return <><Link className="back-link" href="/">← 返回模板广场</Link><ErrorPanel error={template.error} title="模板暂时不可用" retry={() => void template.refetch()} /></>;
  return <><Link className="back-link" href="/">← 返回模板广场</Link><div className="creation-layout">
    <section className="creation-panel panel"><div className="creation-cover"><Image src={template.data.coverUrl} alt={template.data.title + "示例封面"} width={600} height={420} unoptimized priority /><span className="cover-chip">图片创作</span></div>
      <div className="creation-body"><p className="eyebrow">MAKE IT YOURS</p><h1>{template.data.title}</h1><p className="description">{template.data.description}</p><div className="requirements"><span>{template.data.requiredImageCount} 张图片</span><span>{imageTypes(template.data.acceptedMimeTypes)}</span><span>单张 ≤ {fileSize(template.data.maxFileSizeBytes)}</span></div>
        {auth.status === "loading" || auth.status === "changing" ? <Loading text="正在确认账户…" /> : auth.user && auth.status === "ready" ? <Creator key={`${id}:${auth.revision}`} template={template.data} /> : <div className="signin-prompt"><p>{auth.status === "error" ? "请先重新确认账户状态，再上传制作。" : "登录后上传图片，开始你的创作。"}</p>{!auth.user && <Link className="button primary full" href={`/login?returnTo=${encodeURIComponent("/templates/" + id)}`}>登录并开始制作</Link>}</div>}
        <p className="creation-disclaimer">演示模板将返回预置效果图，不真实合成上传图片。</p>
      </div>
    </section>
    <TasksPanel templateId={id} />
  </div></>;
}

function Creator({ template }: { template: TemplateDto }) {
  const { api } = useApp(); const tasks = useTasks();
  const [runtime] = useState(() => {
    const submission = new Submission(api, template.id, tasks.accept, tasks.refresh);
    const uploads = new UploadSession(api, template, submission.changed);
    return { submission, uploads };
  });
  const slots = useSyncExternalStore(runtime.uploads.subscribe, runtime.uploads.getSnapshot, runtime.uploads.getSnapshot);
  const submission = useSyncExternalStore(runtime.submission.subscribe, runtime.submission.getSnapshot, runtime.submission.getSnapshot);
  useEffect(() => () => { runtime.uploads.dispose(); runtime.submission.dispose(); }, [runtime]);
  const ready = slots.length === template.requiredImageCount && slots.every(slot => slot.status === "ready" && !!slot.asset);
  const pending = submission.status === "pending";
  return <form className="creator" onSubmit={event => { event.preventDefault(); void runtime.submission.submit(slots); }}>
    <div className="upload-heading"><h2>上传你的图片</h2><span>{slots.filter(slot => slot.status === "ready").length} / {slots.length}</span></div>
    <div className={slots.length === 1 ? "upload-grid single" : "upload-grid"}>{slots.map((slot, index) => <UploadTile key={index} slot={slot} index={index} disabled={pending} choose={file => void runtime.uploads.choose(index, file)} remove={() => runtime.uploads.remove(index)} retry={() => runtime.uploads.retry(index)} />)}</div>
    {submission.status === "unknown" && <div className="submission-notice" role="alert"><strong>提交结果尚未确认</strong><p>{failureMessage(submission.error)}。素材和本次编号已保留，安全重试不会重复创建任务。</p><small>提交编号 {submission.requestId}</small></div>}
    {submission.status === "error" && <p className="form-error" role="alert">{failureMessage(submission.error)}</p>}
    {submission.status === "accepted" ? <div className="accepted-notice" role="status"><strong>任务已受理</strong><p>制作进度已加入右侧记录，可继续选择下一组图片。</p><button type="button" className="button primary full" onClick={runtime.uploads.clear}>开始下一次制作</button></div> : <button className="button primary full submit-button" type="submit" disabled={!ready || pending}>{pending ? "正在提交…" : submission.status === "unknown" ? "安全重试本次提交" : "开始制作"}<span aria-hidden="true">↗</span></button>}
    {!ready && !pending && submission.status !== "accepted" && <p className="field-help">全部图片上传成功后即可提交。</p>}
  </form>;
}

function UploadTile({ slot, index, disabled, choose, remove, retry }: { slot: UploadSlot; index: number; disabled: boolean; choose: (file: File) => void; remove: () => void; retry: () => void }) {
  const id = useId(); const src = slot.asset?.previewUrl ?? slot.localUrl;
  return <div className={`upload-tile ${slot.status}`}>
    <div className="upload-preview">{src ? <UploadPreview key={src} src={src} number={index + 1} /> : <span className="upload-symbol" aria-hidden="true">＋</span>}{slot.status === "uploading" && <span className="upload-overlay" role="status"><span className="spinner" aria-hidden="true" />上传中</span>}</div>
    <div className="upload-controls"><label className="file-picker" htmlFor={id}><input id={id} type="file" accept="image/jpeg,image/png" aria-label={`选择第 ${index + 1} 张图片`} disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file && !disabled) choose(file); }} /><span>{slot.file ? "替换图片" : `选择图片 ${index + 1}`}</span></label>
      {slot.file && <button type="button" className="icon-button small" aria-label={`移除第 ${index + 1} 张图片`} disabled={disabled} onClick={remove}>×</button>}</div>
    {slot.file && <p className="upload-filename" title={slot.file.name}>{slot.file.name}</p>}
    {slot.status === "ready" && <p className="upload-success" role="status">✓ 上传成功</p>}
    {slot.error && <div className="upload-error" role="alert"><p>{slot.error}</p>{slot.canRetry && <button type="button" className="text-button" disabled={disabled} onClick={retry}>重新上传</button>}</div>}
  </div>;
}
function UploadPreview({ src, number }: { src: string; number: number }) {
  const [failed, setFailed] = useState(false);
  return failed ? <p className="preview-error">预览暂时不可用，可替换图片或稍后重试。</p> : <Image src={src} alt={`第 ${number} 张素材预览`} width={320} height={220} unoptimized onError={() => setFailed(true)} />;
}
