"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="state-panel error-panel" role="alert"><h1>页面暂时无法加载</h1><p>请重试；已受理的后台任务会继续执行。</p><button className="button primary" onClick={reset}>重新加载页面</button></section>; }
