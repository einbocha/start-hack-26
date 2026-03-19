import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Start Hack 26",
  description: "Three.js scene",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
