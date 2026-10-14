import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "姚骏 · yaojunxd",
  description: "yaojunxd.com 首页开场",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="antialiased">
      <body className="font-sans bg-[#171717] text-[#f2f2f2]">{children}</body>
    </html>
  );
}
