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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans bg-[#171717] text-[#f2f2f2]">{children}</body>
    </html>
  );
}
