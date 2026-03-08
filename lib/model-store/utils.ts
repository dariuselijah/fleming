import { FREE_MODELS_IDS } from "@/lib/config"
import { ModelConfig } from "@/lib/models/types"

/**
 * Utility function to filter and sort models based on favorites, search, and visibility
 * @param models - All available models
 * @param favoriteModels - Array of favorite model IDs
 * @param searchQuery - Search query to filter by model name
 * @param isModelHidden - Function to check if a model is hidden
 * @returns Filtered and sorted models
 */
export function filterAndSortModels(
  models: ModelConfig[],
  favoriteModels: string[],
  searchQuery: string,
  isModelHidden: (modelId: string) => boolean
): ModelConfig[] {
  const providerPriority = ["xai", "openai", "google", "anthropic"]

  return models
    .filter((model) => !isModelHidden(model.id))
    .filter((model) =>
      model.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const aFavoriteIndex = favoriteModels?.indexOf(a.id) ?? -1
      const bFavoriteIndex = favoriteModels?.indexOf(b.id) ?? -1
      const aIsFavorite = aFavoriteIndex >= 0
      const bIsFavorite = bFavoriteIndex >= 0

      // Always keep favorites first, preserving explicit user order.
      if (aIsFavorite && bIsFavorite) {
        return aFavoriteIndex - bFavoriteIndex
      }
      if (aIsFavorite) return -1
      if (bIsFavorite) return 1

      // Provider grouping for non-favorites.
      const aProviderRank = providerPriority.indexOf(a.providerId)
      const bProviderRank = providerPriority.indexOf(b.providerId)
      if (aProviderRank !== bProviderRank) {
        return (aProviderRank === -1 ? 999 : aProviderRank) - (bProviderRank === -1 ? 999 : bProviderRank)
      }

      // Fallback to original sorting (free models first)
      const aIsFree = FREE_MODELS_IDS.includes(a.id)
      const bIsFree = FREE_MODELS_IDS.includes(b.id)
      if (aIsFree !== bIsFree) return aIsFree ? -1 : 1

      return a.name.localeCompare(b.name)
    })
}
