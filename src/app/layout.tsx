import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import UndoToast from "@/components/UndoToast";
import { ToastProvider } from "@/components/Toast";
import { SettingsProvider } from "@/components/SettingsProvider";
import { UndoProvider } from "@/lib/useUndo";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import { AutoResetErrorBoundary } from "@/components/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Loot Council | Personal Finance",
  description: "A locally-hosted budgeting app for tracking your finances",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Theme script to prevent flash of wrong theme
  const themeScript = `
    (function() {
      try {
        var theme = localStorage.getItem('loot-council-theme') || 'dungeon';
        document.documentElement.classList.add('theme-' + theme);
      } catch (e) {
        document.documentElement.classList.add('theme-dungeon');
      }
    })();
  `;

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ToastProvider>
          <SettingsProvider>
            <UndoProvider>
              <KeyboardShortcutsProvider>
                <div className="flex min-h-screen">
                  <Sidebar />
                  <main className="flex-1 overflow-auto pt-16 lg:pt-0 pb-20 lg:pb-0">
                    <AutoResetErrorBoundary>
                      {children}
                    </AutoResetErrorBoundary>
                  </main>
                </div>
                <MobileNav />
                <UndoToast />
              </KeyboardShortcutsProvider>
            </UndoProvider>
          </SettingsProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
