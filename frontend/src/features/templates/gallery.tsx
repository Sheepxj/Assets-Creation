"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/components/providers";
import { Empty, ErrorPanel, Loading } from "@/components/ui";
import type { CategoryDto, TemplateDto } from "@/lib/api/contracts";
import { fileSize, imageTypes } from "@/lib/format";

export function Gallery() {
  const { api } = useApp(); const [category, setCategory] = useState("");
  const categories = useQuery({ queryKey: ["templates", "categories"], queryFn: ({ signal }) => api.request<CategoryDto[]>("/api/templates/categories", { signal }) });
  const templates = useQuery({ queryKey: ["templates", "list", category], queryFn: ({ signal }) => api.request<TemplateDto[]>(`/api/templates${category ? "?category=" + encodeURIComponent(category) : ""}`, { signal }) });
  return <>
    <div className="gallery-heading"><div><p className="eyebrow">MADE FOR YOUR MOMENTS</p><h1>找到你的创作灵感</h1><p className="muted">挑一个喜欢的模板，让照片换一种表达。</p></div><span className="gallery-stamp" aria-hidden="true">CREATE<br /><span>✦</span> SOMETHING</span></div>
    <div className="catalog-bar"><h2>图片模板<span className="small-tag">精选</span></h2><p className="muted">简单上传，轻松开始</p></div>
    {categories.isError ? <ErrorPanel error={categories.error} title="分类加载失败" retry={() => void categories.refetch()} /> : <div className="category-tabs" role="group" aria-label="模板分类">
      <button className={category === "" ? "category active" : "category"} aria-pressed={category === ""} onClick={() => setCategory("")}>全部模板</button>
      {categories.data?.map(item => <button key={item.id} className={category === item.id ? "category active" : "category"} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.title}</button>)}
      {categories.isPending && <span className="muted" role="status">加载分类…</span>}
    </div>}
    {templates.isPending ? <Loading text="正在寻找创作灵感…" /> : templates.isError ? <ErrorPanel error={templates.error} retry={() => void templates.refetch()} /> : !templates.data.length ? <Empty title="这个分类暂时没有模板"><button className="button secondary" onClick={() => setCategory("")}>查看全部模板</button></Empty> : <div className="template-grid" aria-label="模板列表">
      {templates.data.map((template, index) => <Link className="template-card" key={template.id} href={`/templates/${encodeURIComponent(template.id)}`}>
        <div className="template-cover"><Image src={template.coverUrl} alt={template.title + "示例封面"} width={480} height={640} unoptimized priority={index < 2} /><span className="cover-chip">{template.requiredImageCount} 张图片</span><span className="cover-action">开始制作 <span aria-hidden="true">↗</span></span></div>
        <div className="template-copy"><h3>{template.title}</h3><p>{template.description}</p><span>{imageTypes(template.acceptedMimeTypes)} <i aria-hidden="true">·</i> 单张 {fileSize(template.maxFileSizeBytes)}</span></div>
      </Link>)}
    </div>}
    <div className="gallery-note"><span aria-hidden="true">✦</span><p>灵感交给模板，回忆由你来定义。</p><Link href="/tasks">查看我的作品 <span aria-hidden="true">→</span></Link></div>
  </>;
}
