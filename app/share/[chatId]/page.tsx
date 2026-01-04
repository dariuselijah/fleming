import { APP_DOMAIN } from "@/lib/config"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Article from "./article"

export const dynamic = "force-static"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chatId: string }>
}): Promise<Metadata> {
  if (!isSupabaseEnabled) {
    return notFound()
  }

  const { chatId } = await params
  const supabase = await createClient()

  if (!supabase) {
    return notFound()
  }

  const { data: chat } = await supabase
    .from("chats")
    .select("title, created_at")
    .eq("id", chatId)
    .single()

  const title = chat?.title || "AskFleming Chat"
  const description = `A conversation with AskFleming, an evidence-based medical AI assistant providing peer-reviewed citations from PubMed, systematic reviews, and clinical trials. Every medical answer includes verified research sources with evidence levels.`

  return {
    title: `${title} - AskFleming`,
    description,
    openGraph: {
      title: `${title} - AskFleming`,
      description,
      type: "article",
      url: `${APP_DOMAIN}/share/${chatId}`,
      images: [
        {
          url: `${APP_DOMAIN}/cover_fleming.jpg`,
          width: 1200,
          height: 630,
          alt: "AskFleming - AI Medical Assistant",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} - AskFleming`,
      description,
      images: [`${APP_DOMAIN}/cover_fleming.jpg`],
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default async function ShareChat({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  if (!isSupabaseEnabled) {
    return notFound()
  }

  const { chatId } = await params
  const supabase = await createClient()

  if (!supabase) {
    return notFound()
  }

  const { data: chatData, error: chatError } = await supabase
    .from("chats")
    .select("id, title, created_at")
    .eq("id", chatId)
    .single()

  if (chatError || !chatData) {
    redirect("/")
  }

  const { data: messagesData, error: messagesError } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })

  if (messagesError || !messagesData) {
    redirect("/")
  }

  return (
    <Article
      messages={messagesData}
      date={chatData.created_at || ""}
      title={chatData.title || ""}
      subtitle={"A conversation in Fleming"}
    />
  )
}
