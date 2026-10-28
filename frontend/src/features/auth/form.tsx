"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/components/providers";
import { FieldError } from "@/components/ui";
import { ApiFailure, failureMessage, isAborted } from "@/lib/api/client";
import { safeReturnTo, validateCredentials } from "./session";

export function AuthForm({ mode, returnTo }: { mode: "login" | "register"; returnTo?: string | string[] }) {
  const { auth, session } = useApp(); const router = useRouter(); const target = safeReturnTo(returnTo);
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({}); const [error, setError] = useState<string | null>(null);
  const registering = mode === "register", busy = auth.status === "changing", blocked = auth.status !== "ready";
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (blocked) return;
    const validation = validateCredentials(username, password, registering ? confirmation : undefined);
    setErrors(validation); setError(null); if (Object.keys(validation).length) return;
    try {
      await session.authenticate(mode, { username, password }); setPassword(""); setConfirmation(""); router.replace(target);
    } catch (error) {
      if (isAborted(error)) return;
      setError(failureMessage(error)); if (error instanceof ApiFailure) setErrors(error.fieldErrors);
    }
  }
  return <section className="auth-layout">
    <div className="auth-intro"><p className="eyebrow">YOUR CREATIVE SPACE</p><h1>让每一张照片<br />都有新的可能。</h1><p>从喜欢的模板出发，上传图片。<br />制作在后台继续，灵感不必等待。</p><div className="auth-art" aria-hidden="true"><span>✦</span><i /><b /></div></div>
    <div className="auth-card panel"><p className="eyebrow">{registering ? "GET STARTED" : "WELCOME BACK"}</p><h2>{registering ? "创建你的账户" : "欢迎回来"}</h2><p className="muted">{registering ? "注册后自动登录，制作记录只属于你。" : "登录后继续制作，查看你的个人作品。"}</p>
      {auth.user && <p className="inline-notice">当前账户：{auth.user.username}。可在此切换账户。</p>}
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="username">用户名</label><input id="username" name="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} disabled={busy} required aria-invalid={!!errors.username} aria-describedby={errors.username ? "username-error" : "username-help"} /><p id="username-help" className="field-help">3～32 位英文字母、数字或下划线</p><FieldError id="username-error" message={errors.username} /></div>
        <div className="field"><label htmlFor="password">密码</label><input id="password" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} required aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : "password-help"} /><p id="password-help" className="field-help">至少 8 个字符，UTF-8 最多 72 字节</p><FieldError id="password-error" message={errors.password} /></div>
        {registering && <div className="field"><label htmlFor="confirmation">确认密码</label><input id="confirmation" name="confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} required aria-invalid={!!errors.confirmation} aria-describedby={errors.confirmation ? "confirmation-error" : undefined} /><FieldError id="confirmation-error" message={errors.confirmation} /></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {auth.status === "error" && <p className="field-help">请先使用上方按钮重新确认账户状态，再提交。</p>}
        <button type="submit" className="button primary full" disabled={blocked}>{busy ? "正在处理…" : auth.status === "loading" ? "确认账户中…" : registering ? "注册并开始创作" : "登录"}</button>
      </form>
      <p className="auth-switch">{registering ? "已有账户？" : "还没有账户？"}<Link href={`${registering ? "/login" : "/register"}?returnTo=${encodeURIComponent(target)}`}>{registering ? "前往登录" : "立即注册"}</Link></p>
      {!registering && <p className="demo-credentials">演示账户 demo_a / demo_b<br />密码 Demo123456!</p>}
    </div>
  </section>;
}
