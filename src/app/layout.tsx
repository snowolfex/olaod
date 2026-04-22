import type { Metadata } from "next";
import { IBM_Plex_Mono, Sora } from "next/font/google";
import { cookies } from "next/headers";

import { APP_THEME_COOKIE_NAME, parseAppTheme } from "@/lib/theme";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = parseAppTheme(cookieStore.get(APP_THEME_COOKIE_NAME)?.value);

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${sora.variable} ${ibmPlexMono.variable} h-full antialiased lg:h-auto`}
      style={{ colorScheme: theme === "light" ? "light" : "dark" }}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col lg:block lg:min-h-screen">
        {children}
      </body>
    </html>
  );
}
