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
  title: "AskFleming - AI-Powered Medical Assistant & Multi-Model Chat",
  description: "AskFleming is an advanced AI chat application powered by Grok-4, GPT-4o, and other leading models. Get instant medical insights, health advice, and AI assistance. Perfect for medical students, healthcare professionals, and anyone seeking reliable health information.",
  keywords: [
    "AskFleming",
    "Fleming",
    "AI medical assistant",
    "health AI",
    "medical AI chat",
    "Grok-4",
    "GPT-4o",
    "healthcare AI",
    "medical advice",
    "AI health assistant",
    "medical chatbot",
    "health information",
    "AI doctor",
    "medical consultation",
    "healthcare chatbot"
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
    title: "AskFleming - AI-Powered Medical Assistant & Multi-Model Chat",
    description: "Get instant medical insights, health advice, and AI assistance with AskFleming. Powered by Grok-4, GPT-4o, and other leading AI models.",
  },
  twitter: {
    card: "summary",
    title: "AskFleming - AI-Powered Medical Assistant",
    description: "Get instant medical insights, health advice, and AI assistance with AskFleming. Powered by Grok-4, GPT-4o, and other leading AI models.",
    creator: "@perkily",
    site: "@perkily",
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
            "description": "AI-powered medical assistant and multi-model chat application",
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
              "AI Medical Assistant",
              "Multi-Model AI Chat",
              "Grok-4 Integration",
              "GPT-4o Support",
              "Medical Advice",
              "Health Information",
              "File Upload Support",
              "Real-time Chat"
            ]
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
