"use client";

import { useEffect, useId, useRef } from "react";
import { failureMessage } from "@/lib/api/client";

export function Loading({ text = "正在加载…" }: { text?: string }) {
  return <div className="state-panel" role="status"><span className="spinner" aria-hidden="true" />{text}</div>;
}
export function ErrorPanel({ error, retry, title }: { error: unknown; retry?: () => void; title?: string }) {
  return <div className="state-panel error-panel" role="alert"><strong>{title ?? "暂时无法加载"}</strong><p>{failureMessage(error)}</p>
    {retry && <button className="button secondary" onClick={retry}>重试</button>}</div>;
}
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="state-panel empty-panel"><span className="empty-mark" aria-hidden="true">◇</span><h3>{title}</h3>{children}</div>;
}
export function Dialog({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!; dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog className="dialog" ref={ref} aria-labelledby={id} onCancel={event => { event.preventDefault(); close(); }}>
    <div className="dialog-heading"><h2 id={id}>{title}</h2><button className="icon-button" aria-label="关闭预览" onClick={close}>×</button></div>{children}
  </dialog>;
}
export function FieldError({ id, message }: { id: string; message?: string }) { return message ? <p id={id} className="field-error" role="alert">{message}</p> : null; }
