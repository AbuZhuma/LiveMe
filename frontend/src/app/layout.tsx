import type { Metadata } from "next";
import { Unbounded, Golos_Text, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import {
  IconGithub,
  IconLinkedin,
  IconTelegram,
  IconInstagram,
} from "@/components/icons";

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

const SITE_URL = "https://abuzhuma.com";

const socials = [
  {
    label: "GitHub - AbuZhuma",
    href: "https://github.com/AbuZhuma",
    Icon: IconGithub,
  },
  {
    label: "LinkedIn - abuzhuma",
    href: "https://www.linkedin.com/in/abuzhuma",
    Icon: IconLinkedin,
  },
  {
    label: "Telegram - AbuZhuma",
    href: "https://t.me/AbuZhuma",
    Icon: IconTelegram,
  },
  {
    label: "Instagram - abu_zhuma",
    href: "https://www.instagram.com/abu_zhuma",
    Icon: IconInstagram,
  },
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LiveMe - прямой эфир Абдырахмана Джумагулова (AbuZhuma)",
    template: "%s - LiveMe · AbuZhuma",
  },
  description:
    "Личный телеканал фулстек-разработчика Абдырахмана Джумагулова (AbuZhuma): один эфир, живые реакции и комментарии. Personal live channel of Abdyrakhman Zhumagulov - full-stack developer.",
  keywords: [
    "Abdyrakhman Zhumagulov",
    "Абдырахман Джумагулов",
    "AbuZhuma",
    "abuzhuma",
    "full-stack developer",
    "фулстек разработчик",
    "веб-разработчик",
    "web developer",
    "LiveMe",
    "прямой эфир",
    "live stream",
  ],
  authors: [{ name: "Abdyrakhman Zhumagulov", url: SITE_URL }],
  creator: "Abdyrakhman Zhumagulov (AbuZhuma)",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "LiveMe · AbuZhuma",
    title: "LiveMe - прямой эфир Абдырахмана Джумагулова (AbuZhuma)",
    description:
      "Личный телеканал фулстек-разработчика: один эфир, живые реакции и комментарии. Personal live channel of Abdyrakhman Zhumagulov - full-stack developer.",
    locale: "ru_RU",
    alternateLocale: ["en_US"],
  },
  twitter: {
    card: "summary",
    title: "LiveMe - Abdyrakhman Zhumagulov (AbuZhuma)",
    description:
      "Личный телеканал фулстек-разработчика Абдырахмана Джумагулова. Personal live channel of a full-stack developer.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

const personJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": `${SITE_URL}/#person`,
      name: "Abdyrakhman Zhumagulov",
      alternateName: ["Абдырахман Джумагулов", "AbuZhuma"],
      jobTitle: "Full-Stack Developer",
      description:
        "Full-stack developer. Фулстек-разработчик: веб-приложения, стриминг, realtime.",
      url: SITE_URL,
      sameAs: [
        "https://github.com/AbuZhuma",
        "https://www.linkedin.com/in/abuzhuma",
        "https://t.me/AbuZhuma",
        "https://www.instagram.com/abu_zhuma",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "LiveMe",
      alternateName: "LiveMe · AbuZhuma",
      url: SITE_URL,
      inLanguage: ["ru", "en"],
      publisher: { "@id": `${SITE_URL}/#person` },
    },
  ],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <header className="sticky top-0 z-40 border-b border-line bg-bg">
            <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-3 sm:px-6">
              <Link href="/" className="flex items-center gap-2.5">
                <span className="font-display text-sm font-semibold tracking-[0.22em] uppercase">
                  Live<span className="text-accent">·</span>Me
                </span>
                <span
                  aria-hidden
                  className="hidden text-line select-none sm:inline"
                >
                  |
                </span>
                <span className="hidden font-mono text-sm text-muted sm:inline">
                  AbuZhuma
                </span>
              </Link>
              <div className="ml-auto flex items-center">
                <ThemeToggle className="-mr-2" />
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="mx-auto w-full max-w-7xl px-3 pt-6 pb-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="font-mono text-[11px] text-muted">
                <p>© {new Date().getFullYear()} LiveMe | abuzhuma.com</p>
              </div>
              <nav aria-label="Соцсети" className="flex items-center gap-1">
                {socials.map(({ label, href, Icon }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer me"
                    aria-label={label}
                    title={label}
                    className="rounded-brand p-2 text-muted transition-colors hover:bg-panel-2 hover:text-ink"
                  >
                    <Icon size={16} />
                  </a>
                ))}
              </nav>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
