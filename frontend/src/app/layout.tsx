import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "素材制作",
  description: "浏览创意模板，上传图片，查看制作进度与结果。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
