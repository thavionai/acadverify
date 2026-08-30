import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "AcadVerify",
  description: "Privacy-preserving academic credential verification on Midnight.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-ink-950 text-paper">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
