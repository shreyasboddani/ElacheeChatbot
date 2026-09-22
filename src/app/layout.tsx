import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elachee Information Assistant",
  description:
    "A grounded information assistant prototype using approved information from Elachee.",
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
