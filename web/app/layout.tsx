import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LocalBiz Pro — Card Generator",
  description: "Instagram card generator for LocalBiz Pro",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
