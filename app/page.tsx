import { AuthGuard } from "@/app/components/auth-guard"
import { ChatContainer } from "@/app/components/chat/chat-container"
import { LayoutApp } from "@/app/components/layout/layout-app"
import { MessagesProvider } from "@/lib/chat-store/messages/provider"

export const dynamic = "force-dynamic"

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
