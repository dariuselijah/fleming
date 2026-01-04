import { ChatContainer } from "@/app/components/chat/chat-container"
import { LayoutApp } from "@/app/components/layout/layout-app"
import { MessagesProvider } from "@/lib/chat-store/messages/provider"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "AskFleming - Evidence-Based Medical AI | Start Chatting Now",
  description: "Start chatting with AskFleming and get evidence-based medical answers with peer-reviewed citations. Every response includes verified sources from PubMed, systematic reviews, and clinical trials with evidence levels and study types. Trusted by healthcare professionals for clinical decision support.",
  keywords: [
    "AskFleming chat",
    "evidence-based medical chat",
    "medical citations chat",
    "peer-reviewed medical AI",
    "PubMed citations",
    "clinical evidence chat",
    "medical literature search",
    "evidence-based medicine",
    "medical research citations",
    "systematic review citations",
    "RCT citations",
    "clinical trial evidence",
    "medical citation system",
    "evidence synthesis",
    "clinical decision support"
  ],
  openGraph: {
    title: "AskFleming - Evidence-Based Medical AI | Start Chatting Now",
    description: "Get evidence-based medical answers with peer-reviewed citations from PubMed, systematic reviews, and clinical trials. Every response includes verified research sources with evidence levels.",
    url: "https://askfleming.perkily.io",
    type: "website",
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
    title: "AskFleming - Evidence-Based Medical AI | Start Chatting Now",
    description: "Get evidence-based medical answers with peer-reviewed citations. Every response includes verified sources from PubMed and clinical trials.",
    images: ["https://askfleming.perkily.io/cover_fleming.jpg"],
  },
}

export default function Home() {
  return (
    <MessagesProvider>
      <LayoutApp>
        <ChatContainer />
      </LayoutApp>
    </MessagesProvider>
  )
}
