import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { FeedbackProvider } from "@/components/feedback";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "SwitchSignal",
  description:
    "Competitor intelligence, opportunity scouting & win-over engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <FeedbackProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 px-4 py-6 pt-16 lg:px-10 lg:py-8 lg:pt-8 max-w-[1400px]">
              {children}
            </main>
          </div>
        </FeedbackProvider>
      </body>
    </html>
  );
}
