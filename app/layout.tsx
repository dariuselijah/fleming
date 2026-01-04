import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ChatsProvider } from "@/lib/chat-store/chats/provider"
import { ChatSessionProvider } from "@/lib/chat-store/session/provider"
import { ModelProvider } from "@/lib/model-store/provider"
import { TanstackQueryProvider } from "@/lib/tanstack-query/tanstack-query-provider"
import { UserPreferencesProvider } from "@/lib/user-preference-store/provider"
import { UserProvider } from "@/lib/user-store/provider"
import { getUserProfile } from "@/lib/user/api"
import { ThemeProvider } from "next-themes"
import Script from "next/script"
import { LayoutClient } from "./layout-client"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "AskFleming - Evidence-Based Medical AI with Peer-Reviewed Citations",
  description: "AskFleming provides evidence-based medical answers backed by peer-reviewed research. Every response includes citations from PubMed, systematic reviews, and clinical trials. Get instant access to medical literature with evidence levels, study types, and verified citations. Trusted by healthcare professionals and medical students for clinical decision support.",
  keywords: [
    "AskFleming",
    "Fleming",
    "evidence-based medicine",
    "medical citations",
    "peer-reviewed medical AI",
    "PubMed citations",
    "clinical evidence",
    "medical literature search",
    "evidence-based clinical guidance",
    "medical research citations",
    "systematic review citations",
    "RCT citations",
    "clinical trial evidence",
    "medical citation system",
    "evidence synthesis",
    "medical literature access",
    "clinical decision support",
    "evidence grading",
    "Oxford CEBM evidence levels",
    "medical research assistant",
    "healthcare evidence",
    "clinical evidence database",
    "medical citation verification",
    "evidence-based healthcare",
    "medical research platform",
    "clinical research citations"
  ],
  authors: [{ name: "Perkily", url: "https://perkily.io" }],
  creator: "Perkily",
  publisher: "Perkily",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL("https://askfleming.perkily.io"),
  alternates: {
    canonical: "https://askfleming.perkily.io",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://askfleming.perkily.io",
    siteName: "AskFleming",
    title: "AskFleming - Evidence-Based Medical AI with Peer-Reviewed Citations",
    description: "Get evidence-based medical answers with verified citations from PubMed, systematic reviews, and clinical trials. Every response includes peer-reviewed research with evidence levels and study types. Trusted by healthcare professionals for clinical decision support.",
    images: [
      {
        url: "https://askfleming.perkily.io/cover_fleming.jpg",
        width: 1200,
        height: 630,
        alt: "AskFleming - Evidence-Based Medical AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AskFleming - Evidence-Based Medical AI with Citations",
    description: "Evidence-based medical answers with peer-reviewed citations from PubMed, systematic reviews, and clinical trials. Every response includes verified research sources.",
    creator: "@HelloPerkily",
    site: "@HelloPerkily",
    images: ["https://askfleming.perkily.io/cover_fleming.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "your-google-verification-code", // Replace with actual verification code
  },
  manifest: "/manifest.json",
  category: "Healthcare",
  classification: "Medical AI Assistant",
  other: {
    "theme-color": "#000000",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "AskFleming",
    "msapplication-TileColor": "#000000",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const isDev = process.env.NODE_ENV === "development"
  const isOfficialDeployment = process.env.FLEMING_OFFICIAL === "true"
  const userProfile = await getUserProfile()

  return (
    <html lang="en" suppressHydrationWarning>
      {isOfficialDeployment ? (
        <Script
          defer
          src="https://assets.onedollarstats.com/stonks.js"
          {...(isDev ? { "data-debug": "askfleming.perkily.io" } : {})}
        />
      ) : null}
      
      {/* Structured Data for SEO */}
      <Script
        id="structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "AskFleming",
            "description": "Evidence-based medical AI assistant providing peer-reviewed citations from PubMed, systematic reviews, and clinical trials. Every medical answer includes verified research sources with evidence levels and study types.",
            "url": "https://askfleming.perkily.io",
            "applicationCategory": "HealthApplication",
            "operatingSystem": "Web Browser",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD"
            },
            "author": {
              "@type": "Organization",
              "name": "Perkily",
              "url": "https://perkily.io"
            },
            "provider": {
              "@type": "Organization",
              "name": "Perkily",
              "url": "https://perkily.io"
            },
            "featureList": [
              "Evidence-Based Medical Answers",
              "Peer-Reviewed Citations",
              "PubMed Integration",
              "Systematic Review Citations",
              "Clinical Trial Evidence",
              "Evidence Level Grading (Oxford CEBM)",
              "Citation Verification",
              "Medical Literature Search",
              "Evidence Synthesis",
              "Hybrid Search (Semantic + Full-Text)",
              "Study Type Classification",
              "Real-time Citation Rendering",
              "Clinical Decision Support",
              "Medical Research Access"
            ],
            "audience": {
              "@type": "Audience",
              "audienceType": ["Healthcare Professionals", "Medical Students", "Clinical Researchers", "Evidence-Based Practitioners"]
            }
          })
        }}
      />

      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TanstackQueryProvider>
          <LayoutClient />
          <UserProvider initialUser={userProfile}>
            <ModelProvider>
              <ChatsProvider userId={userProfile?.id}>
                <ChatSessionProvider>
                  <UserPreferencesProvider
                    userId={userProfile?.id}
                    initialPreferences={userProfile?.preferences}
                  >
                    <TooltipProvider
                      delayDuration={200}
                      skipDelayDuration={500}
                    >
                      <ThemeProvider
                        attribute="class"
                        defaultTheme="light"
                        enableSystem
                        disableTransitionOnChange
                      >
                        <SidebarProvider defaultOpen>
                          <Toaster position="top-center" />
                          {children}
                        </SidebarProvider>
                      </ThemeProvider>
                    </TooltipProvider>
                  </UserPreferencesProvider>
                </ChatSessionProvider>
              </ChatsProvider>
            </ModelProvider>
          </UserProvider>
        </TanstackQueryProvider>
      </body>
    </html>
  )
}
