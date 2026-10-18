import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gist — read a real book, say what it means",
  description:
    "Translate a real foreign-language book into English passage by passage. Graded on whether you understood the ideas, not on your wording.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
