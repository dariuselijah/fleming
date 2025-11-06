import {
  getAllModels,
  getModelsForUserProviders,
  getModelsWithAccessFlags,
  refreshModelsCache,
} from "@/lib/models"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    if (!supabase) {
      const allModels = await getAllModels()
      const models = allModels.map((model) => ({
        ...model,
        accessible: true,
      }))
      return new Response(JSON.stringify({ models }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    }

    const { data: authData } = await supabase.auth.getUser()

    if (!authData?.user?.id) {
      const models = await getModelsWithAccessFlags()
      return new Response(JSON.stringify({ models }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    }

    const { data, error } = await supabase
      .from("user_keys")
      .select("provider")
      .eq("user_id", authData.user.id)

    if (error) {
      console.error("Error fetching user keys:", error)
      const models = await getModelsWithAccessFlags()
      return new Response(JSON.stringify({ models }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    }

    const userProviders = data?.map((k) => k.provider) || []

    // Get all models with access flags first
    const allModels = await getModelsWithAccessFlags()
    
    // If user has provider keys, mark those provider models as accessible
    if (userProviders.length > 0) {
      const userProviderModels = await getModelsForUserProviders(userProviders)
      const userProviderModelIds = new Set(userProviderModels.map(m => m.id))
      
      // Update accessible flag for models where user has keys
      const models = allModels.map(model => ({
        ...model,
        accessible: model.accessible || userProviderModelIds.has(model.id)
      }))
      
      return new Response(JSON.stringify({ models }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    }

    // If no user keys, return all models with access flags
    return new Response(JSON.stringify({ models: allModels }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error) {
    console.error("Error fetching models:", error)
    return new Response(JSON.stringify({ error: "Failed to fetch models" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    })
  }
}

export async function POST() {
  try {
    refreshModelsCache()
    const models = await getAllModels()

    return NextResponse.json({
      message: "Models cache refreshed",
      models,
      timestamp: new Date().toISOString(),
      count: models.length,
    })
  } catch (error) {
    console.error("Failed to refresh models:", error)
    return NextResponse.json(
      { error: "Failed to refresh models" },
      { status: 500 }
    )
  }
}
