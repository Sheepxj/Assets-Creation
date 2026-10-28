"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./providers";
import { useTasks } from "@/features/tasks/provider";
import { failureMessage } from "@/lib/api/client";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { auth, session } = useApp(); const { pending } = useTasks(); const path = usePathname();
  const busy = auth.status === "loading" || auth.status === "changing";
  return <>
    <a className="skip-link" href="#main">跳到主要内容</a>
    <header className="site-header"><div className="header-inner">
      <Link className="brand" href="/" aria-label="素材工坊首页"><span className="brand-icon" aria-hidden="true">✦</span><span>素材工坊<small>CREATIVE STUDIO</small></span></Link>
      <nav aria-label="主导航"><Link className={path === "/" || path.startsWith("/templates/") ? "nav-link active" : "nav-link"} href="/" aria-current={path === "/" ? "page" : undefined}>模板广场</Link>
        <Link className={path === "/tasks" ? "nav-link active" : "nav-link"} href="/tasks" aria-current={path === "/tasks" ? "page" : undefined}>我的作品{pending > 0 && <span className="nav-count" aria-label={`${pending} 个未完成任务`}>{pending}</span>}</Link></nav>
      <div className="account-actions">
        {busy ? <span className="muted account-loading" role="status">确认账户…</span> : auth.user ? <><span className="account-name"><span className="avatar" aria-hidden="true">{auth.user.username[0].toUpperCase()}</span>{auth.user.username}</span><button className="button subtle small" onClick={() => void session.logout()} disabled={auth.status !== "ready"}>退出</button></>
          : <><Link className="button subtle small" href="/login">登录</Link><Link className="button primary small" href="/register">注册</Link></>}
      </div>
    </div></header>
    {auth.notice && <div className="global-notice" role="status">{auth.notice}<Link href={`/login?returnTo=${encodeURIComponent(path)}`}>重新登录</Link></div>}
    {auth.status === "error" && <div className="global-notice error-panel" role="alert"><span>账户状态暂时无法确认：{failureMessage(auth.error)}</span><button className="button secondary small" onClick={() => void session.restore()}>重新确认账户</button></div>}
    <main id="main" className="main-container">{children}</main>
    <footer className="site-footer"><span>素材工坊 · 把照片变成新的灵感</span><span>演示制作使用预置图片，不真实合成上传内容。</span></footer>
  </>;
}
