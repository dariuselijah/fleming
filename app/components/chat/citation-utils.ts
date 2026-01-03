/**
 * Utilities for processing citations from sources and message content
 */

import type { SourceUIPart } from "@ai-sdk/ui-utils"
import { parseCitationMarkers, getUniqueCitationIndices } from "@/lib/citations/parser"
import { fetchPubMedArticle, searchPubMedByTitle, searchPubMedByDOI } from "@/lib/pubmed/api"
import type { CitationData } from "./citation-popup"

/**
 * Extract citation data from sources
 */
export async function extractCitationsFromSources(
  sources: SourceUIPart["source"][],
  messageContent: string
): Promise<Map<number, CitationData>> {
  const citations = new Map<number, CitationData>()
  
  // Parse citation markers from message
  const markers = parseCitationMarkers(messageContent)
  const uniqueIndices = getUniqueCitationIndices(markers)
  
  // If no citation markers found, try to map sources by order
  const indicesToUse = uniqueIndices.length > 0 
    ? uniqueIndices 
    : sources.map((_, i) => i + 1)
  
  // Map sources to citation indices
  // Process in parallel for better performance
  const citationPromises = sources.map(async (source, i) => {
    if (!source || !source.url) return null
    
    const citationIndex = indicesToUse[i] || (i + 1)
    try {
      return await extractCitationFromSource(source, citationIndex)
    } catch (error) {
      console.error(`Error extracting citation ${citationIndex}:`, error)
      return null
    }
  })
  
  const citationResults = await Promise.all(citationPromises)
  
  citationResults.forEach((citationData, i) => {
    if (citationData) {
      const citationIndex = indicesToUse[i] || (i + 1)
      citations.set(citationIndex, citationData)
    }
  })
  
  return citations
}

/**
 * Extract citation data from a source URL
 */
async function extractCitationFromSource(
  source: SourceUIPart["source"],
  index: number
): Promise<CitationData | null> {
  try {
    // Check if URL is a PubMed URL
    const pubmedMatch = source.url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/)
    if (pubmedMatch) {
      const pmid = pubmedMatch[1]
      const article = await fetchPubMedArticle(pmid)
      if (article) {
        return {
          index,
          title: article.title,
          authors: article.authors,
          journal: article.journal,
          year: article.year,
          url: article.url,
          doi: article.doi,
          pmid: article.pmid,
          abstract: article.abstract,
        }
      }
    }
    
    // Check if URL contains a DOI
    const doiMatch = source.url.match(/doi\.org\/([^\s]+)/) || 
                     source.url.match(/doi[:\s]+([^\s]+)/i)
    if (doiMatch) {
      const doi = doiMatch[1]
      const article = await searchPubMedByDOI(doi)
      if (article) {
        return {
          index,
          title: article.title,
          authors: article.authors,
          journal: article.journal,
          year: article.year,
          url: article.url,
          doi: article.doi,
          pmid: article.pmid,
          abstract: article.abstract,
        }
      }
    }
    
    // Try to search by title if we have one
    if (source.title) {
      const article = await searchPubMedByTitle(source.title)
      if (article) {
        return {
          index,
          title: article.title,
          authors: article.authors,
          journal: article.journal,
          year: article.year,
          url: article.url,
          doi: article.doi,
          pmid: article.pmid,
          abstract: article.abstract,
        }
      }
    }
    
    // Fallback: create citation from source metadata
    // Extract institution/journal name from URL
    const journalName = extractJournalFromUrl(source.url) || 
                        source.title?.split(' - ')[0] || 
                        'Unknown Source'
    
    return {
      index,
      title: source.title || 'Untitled',
      authors: [],
      journal: journalName,
      year: extractYearFromUrl(source.url) || '',
      url: source.url,
    }
  } catch (error) {
    console.error('Error extracting citation from source:', error)
    // Fallback citation
    const journalName = extractJournalFromUrl(source.url) || 'Unknown Source'
    return {
      index,
      title: source.title || 'Untitled',
      authors: [],
      journal: journalName,
      year: '',
      url: source.url,
    }
  }
}

/**
 * Extract journal/institution name from URL
 * Returns full institution name for display
 */
export function extractJournalFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()
    
    // Medical journals and institutions
    if (hostname.includes('aafp.org')) return 'American Family Physician'
    if (hostname.includes('uptodate.com')) return 'UpToDate'
    if (hostname.includes('nejm.org')) return 'New England Journal of Medicine'
    if (hostname.includes('jama') || hostname.includes('jamanetwork.com')) return 'Journal of the American Medical Association'
    if (hostname.includes('bmj.com')) return 'British Medical Journal'
    if (hostname.includes('thelancet.com')) return 'The Lancet'
    if (hostname.includes('nature.com')) return 'Nature'
    if (hostname.includes('science.org')) return 'Science'
    if (hostname.includes('cell.com')) return 'Cell'
    if (hostname.includes('pubmed') || hostname.includes('ncbi.nlm.nih.gov')) return 'PubMed'
    if (hostname.includes('acpjournals.org')) return 'Annals of Internal Medicine'
    if (hostname.includes('mayoclinic.org') || hostname.includes('mcpiqojournal.org')) return 'Mayo Clinic Proceedings'
    if (hostname.includes('onlinelibrary.wiley.com')) return 'Journal of the American Geriatrics Society'
    if (hostname.includes('acponline.org')) return 'American College of Physicians'
    if (hostname.includes('psychiatry.org')) return 'American Psychiatric Association'
    
    // Extract from hostname - capitalize properly
    const domain = hostname.replace(/^www\./, '').split('.')[0]
    if (domain) {
      // Convert common abbreviations
      const domainMap: Record<string, string> = {
        'aafp': 'American Family Physician',
        'nejm': 'New England Journal of Medicine',
        'jama': 'Journal of the American Medical Association',
        'bmj': 'British Medical Journal',
        'acp': 'American College of Physicians',
      }
      
      if (domainMap[domain]) {
        return domainMap[domain]
      }
      
      // Capitalize first letter
      return domain.charAt(0).toUpperCase() + domain.slice(1)
    }
    
    return null
  } catch {
    return null
  }
}

/**
 * Extract year from URL
 */
export function extractYearFromUrl(url: string): string | null {
  const yearMatch = url.match(/\/(20\d{2})\//)
  return yearMatch ? yearMatch[1] : null
}

/**
 * Extract citations from web search sources
 * Web search returns sources with URLs - we need to extract PubMed/JAMA data
 */
export async function extractCitationsFromWebSearch(
  sources: SourceUIPart["source"][],
  messageContent: string
): Promise<Map<number, CitationData>> {
  const citations = new Map<number, CitationData>()
  
  if (!sources || sources.length === 0) {
    return citations
  }
  
  // Parse citation markers from message
  const markers = parseCitationMarkers(messageContent)
  const uniqueIndices = getUniqueCitationIndices(markers)
  
  // Always create citations from sources, even if no markers found
  // Map sources by order (1, 2, 3, etc.) - this ensures citations always display
  const indicesToUse = uniqueIndices.length > 0 
    ? uniqueIndices 
    : sources.map((_, i) => i + 1)
  
  // Process sources in parallel for better performance
  const citationPromises = sources.map(async (source, i) => {
    if (!source || !source.url) return null
    
    const citationIndex = indicesToUse[i] || (i + 1)
    
    try {
      // Check if it's a PubMed URL
      const pubmedMatch = source.url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/)
      if (pubmedMatch) {
        const pmid = pubmedMatch[1]
        const article = await fetchPubMedArticle(pmid)
        if (article) {
          return {
            index: citationIndex,
            title: article.title,
            authors: article.authors,
            journal: article.journal,
            year: article.year,
            url: article.url,
            doi: article.doi,
            pmid: article.pmid,
            abstract: article.abstract,
            isNew: isRecentArticle(article.year),
          }
        }
      }
      
      // Check for JAMA URLs
      if (source.url.includes('jamanetwork.com') || source.url.includes('jama')) {
        const jamaData = await extractJAMACitation(source)
        if (jamaData) {
          return {
            index: citationIndex,
            title: jamaData.title || source.title || 'Untitled',
            authors: jamaData.authors || [],
            journal: jamaData.journal || extractJournalFromUrl(source.url) || 'Unknown',
            year: jamaData.year || extractYearFromUrl(source.url) || '',
            url: jamaData.url || source.url,
            doi: jamaData.doi,
            pmid: jamaData.pmid,
            abstract: jamaData.abstract,
            isNew: isRecentArticle(jamaData.year || ''),
          }
        }
      }
      
      // Check for NEJM URLs
      if (source.url.includes('nejm.org')) {
        const nejmData = await extractNEJMCitation(source)
        if (nejmData) {
          return {
            index: citationIndex,
            title: nejmData.title || source.title || 'Untitled',
            authors: nejmData.authors || [],
            journal: nejmData.journal || extractJournalFromUrl(source.url) || 'Unknown',
            year: nejmData.year || extractYearFromUrl(source.url) || '',
            url: nejmData.url || source.url,
            doi: nejmData.doi,
            pmid: nejmData.pmid,
            abstract: nejmData.abstract,
            isNew: isRecentArticle(nejmData.year || ''),
          }
        }
      }
      
      // Try standard extraction
      return await extractCitationFromSource(source, citationIndex)
    } catch (error) {
      console.error(`Error extracting citation ${citationIndex}:`, error)
      return null
    }
  })
  
  const results = await Promise.all(citationPromises)
  results.forEach((citation, i) => {
    if (citation) {
      const index = indicesToUse[i] || (i + 1)
      citations.set(index, citation)
    }
  })
  
  return citations
}

/**
 * Check if article is recent (within last year)
 */
function isRecentArticle(year: string): boolean {
  if (!year) return false
  const currentYear = new Date().getFullYear()
  const articleYear = parseInt(year, 10)
  if (isNaN(articleYear)) return false
  return currentYear - articleYear <= 1
}

/**
 * Extract JAMA citation from source
 */
async function extractJAMACitation(source: SourceUIPart["source"]): Promise<Partial<CitationData> | null> {
  try {
    // Try to extract from URL or title
    const title = source.title || 'Untitled'
    const year = extractYearFromUrl(source.url) || new Date().getFullYear().toString()
    
    // Try to search PubMed by title to get full metadata
    const article = await searchPubMedByTitle(title)
    if (article && (article.journal.includes('JAMA') || article.journal.includes('Journal of the American Medical Association'))) {
      return {
        title: article.title,
        authors: article.authors,
        journal: article.journal,
        year: article.year,
        url: article.url || source.url,
        doi: article.doi,
        pmid: article.pmid,
        abstract: article.abstract,
      }
    }
    
    // Fallback to basic structure
    return {
      title,
      journal: 'JAMA',
      year,
      url: source.url,
    }
  } catch (error) {
    console.error('Error extracting JAMA citation:', error)
    return null
  }
}

/**
 * Extract NEJM citation from source
 */
async function extractNEJMCitation(source: SourceUIPart["source"]): Promise<Partial<CitationData> | null> {
  try {
    const title = source.title || 'Untitled'
    const year = extractYearFromUrl(source.url) || new Date().getFullYear().toString()
    
    // Try to search PubMed by title
    const article = await searchPubMedByTitle(title)
    if (article && (article.journal.includes('NEJM') || article.journal.includes('New England Journal'))) {
      return {
        title: article.title,
        authors: article.authors,
        journal: article.journal,
        year: article.year,
        url: article.url || source.url,
        doi: article.doi,
        pmid: article.pmid,
        abstract: article.abstract,
      }
    }
    
    // Fallback
    return {
      title,
      journal: 'NEJM',
      year,
      url: source.url,
    }
  } catch (error) {
    console.error('Error extracting NEJM citation:', error)
    return null
  }
}

