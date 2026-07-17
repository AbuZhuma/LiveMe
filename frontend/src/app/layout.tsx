import type { Metadata } from "next";
import { Unbounded, Golos_Text, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});
const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin", "cyrillic"],
});
const jbmono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "LiveMe - прямой эфир",
  description: "Личный телеканал: один эфир, живые реакции и комментарии.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${unbounded.variable} ${golos.variable} ${jbmono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <header className="sticky top-0 z-40 border-b border-line bg-bg">
            <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-3 sm:px-6">
              <Link
                href="/"
                className="font-display text-sm font-semibold tracking-[0.22em] uppercase"
              >
                Live<span className="text-accent">·</span>Me
              </Link>
              <div className="ml-auto flex items-center">
                <ThemeToggle className="-mr-2" />
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="mx-auto w-full max-w-7xl px-3 pt-6 pb-4 sm:px-6">
            <p className="font-mono text-[11px] text-muted">
              © {new Date().getFullYear()} abuzhuma.com
            </p>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
