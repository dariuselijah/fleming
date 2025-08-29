import { AuthGuard } from "@/app/components/auth-guard"
import { ChatContainer } from "@/app/components/chat/chat-container"
import { LayoutApp } from "@/app/components/layout/layout-app"
import { MessagesProvider } from "@/lib/chat-store/messages/provider"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "AskFleming - AI Medical Assistant | Start Chatting Now",
  description: "Start chatting with AskFleming, your AI-powered medical assistant. Get instant health insights, medical advice, and AI assistance powered by Grok-4, GPT-4o, and other leading models.",
  keywords: ["AskFleming chat", "AI medical chat", "health AI assistant", "start medical chat", "Grok-4 medical", "GPT-4o health"],
  openGraph: {
    title: "AskFleming - AI Medical Assistant | Start Chatting Now",
    description: "Start chatting with AskFleming, your AI-powered medical assistant. Get instant health insights, medical advice, and AI assistance.",
    url: "https://askfleming.perkily.io",
    type: "website",
  },
}

export default function Home() {
  return (
    <AuthGuard>
      <MessagesProvider>
        <LayoutApp>
          <ChatContainer />
        </LayoutApp>
      </MessagesProvider>
    </AuthGuard>
  )
}
