export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="mb-4 text-sm font-semibold tracking-widest text-lime-300">素材制作</p>
      <h1 className="max-w-2xl text-4xl leading-tight font-semibold sm:text-5xl">从图片出发，制作你的创意素材。</h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400">浏览模板，上传图片，随时查看制作进度与结果。</p>
      <a className="mt-10 w-fit rounded-lg bg-lime-300 px-5 py-3 font-medium text-slate-950" href="/api/health" target="_blank" rel="noreferrer">查看服务连接状态（新窗口）</a>
    </main>
  );
}
