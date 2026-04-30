import type { Metadata } from "next";
import { AppSidebar } from "@/components/layout/AppSidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Memory Agent",
  description: "Local-first career memory and opportunity analysis workspace."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen bg-[#f4f6f5]">
          <AppSidebar />
          <main className="min-h-screen px-4 py-5 lg:ml-64 lg:px-6 lg:py-5">{children}</main>
        </div>
      </body>
    </html>
  );
}
