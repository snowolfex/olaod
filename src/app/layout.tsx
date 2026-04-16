import type { Metadata } from "next";
import { IBM_Plex_Mono, Sora } from "next/font/google";
import Script from "next/script";

import { APP_THEME_STORAGE_KEY } from "@/lib/theme";

import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "oload",
  description:
    "Premium mobile-first control plane for Ollama chat, models, and administration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${sora.variable} ${ibmPlexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {`(() => {
            try {
              const storedTheme = window.localStorage.getItem(${JSON.stringify(APP_THEME_STORAGE_KEY)});
              const theme = storedTheme === "dark" || storedTheme === "tech" ? storedTheme : "light";
              document.documentElement.dataset.theme = theme;
              document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
            } catch {
              document.documentElement.dataset.theme = "light";
              document.documentElement.style.colorScheme = "light";
            }
          })();`}
        </Script>
        {children}
      </body>
    </html>
  );
}
