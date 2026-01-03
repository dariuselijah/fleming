/**
 * PubMed API utility for fetching publication details
 * Uses NCBI E-utilities API
 */

export interface PubMedArticle {
  pmid: string
  title: string
  authors: string[]
  journal: string
  year: string
  volume?: string
  issue?: string
  pages?: string
  doi?: string
  abstract?: string
  url: string
}

export interface PubMedSearchResult {
  articles: PubMedArticle[]
  totalResults: number
}

/**
 * Search PubMed by query string
 */
export async function searchPubMed(
  query: string,
  maxResults: number = 10
): Promise<PubMedSearchResult> {
  try {
    // Step 1: Search for article IDs
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json`
    
    const searchResponse = await fetch(searchUrl)
    const searchData = await searchResponse.json()
    
    const pmids = searchData.esearchresult?.idlist || []
    
    if (pmids.length === 0) {
      return { articles: [], totalResults: 0 }
    }
    
    // Step 2: Fetch article details
    const articles = await fetchPubMedArticles(pmids)
    
    return {
      articles,
      totalResults: parseInt(searchData.esearchresult?.count || '0', 10)
    }
  } catch (error) {
    console.error('PubMed search error:', error)
    return { articles: [], totalResults: 0 }
  }
}

/**
 * Fetch article details by PMID
 */
export async function fetchPubMedArticle(pmid: string): Promise<PubMedArticle | null> {
  const articles = await fetchPubMedArticles([pmid])
  return articles[0] || null
}

/**
 * Fetch multiple articles by PMIDs
 */
async function fetchPubMedArticles(pmids: string[]): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return []
  
  try {
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`
    
    const response = await fetch(fetchUrl)
    const xmlText = await response.text()
    
    // Parse XML (simplified parser - in production, use a proper XML parser)
    return parsePubMedXML(xmlText)
  } catch (error) {
    console.error('PubMed fetch error:', error)
    return []
  }
}

/**
 * Parse PubMed XML response
 */
function parsePubMedXML(xmlText: string): PubMedArticle[] {
  const articles: PubMedArticle[] = []
  
  // Simple regex-based parsing (for production, use DOMParser or xml2js)
  const articleMatches = xmlText.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)
  
  for (const match of articleMatches) {
    const articleXml = match[1]
    
    const pmid = extractXMLValue(articleXml, 'PMID')
    const title = extractXMLValue(articleXml, 'ArticleTitle')
    const journal = extractXMLValue(articleXml, 'Title') || extractXMLValue(articleXml, 'MedlineTA')
    const year = extractXMLValue(articleXml, 'Year') || extractXMLValue(articleXml, 'PubDate', 'Year')
    const volume = extractXMLValue(articleXml, 'Volume')
    const issue = extractXMLValue(articleXml, 'Issue')
    const pages = extractXMLValue(articleXml, 'MedlinePgn') || extractXMLValue(articleXml, 'Pages')
    
    // Extract DOI - can be in ELocationID with EIdType="doi" or in ArticleIdList
    let doi = extractXMLValue(articleXml, 'ELocationID')
    if (!doi || !doi.toLowerCase().includes('doi')) {
      // Try ArticleIdList
      const articleIdMatches = articleXml.matchAll(/<ArticleId[^>]*IdType="doi"[^>]*>([\s\S]*?)<\/ArticleId>/gi)
      for (const match of articleIdMatches) {
        doi = match[1].trim()
        break
      }
    }
    // Clean DOI if it contains "doi:" prefix
    if (doi) {
      doi = doi.replace(/^doi:/i, '').trim()
    }
    
    const abstract = extractXMLValue(articleXml, 'AbstractText')
    
    // Extract authors
    const authors: string[] = []
    const authorMatches = articleXml.matchAll(/<Author>([\s\S]*?)<\/Author>/g)
    for (const authorMatch of authorMatches) {
      const authorXml = authorMatch[1]
      const lastName = extractXMLValue(authorXml, 'LastName')
      const firstName = extractXMLValue(authorXml, 'ForeName')
      const initials = extractXMLValue(authorXml, 'Initials')
      
      if (lastName) {
        const authorName = firstName 
          ? `${lastName} ${initials || firstName.charAt(0)}`
          : lastName
        authors.push(authorName)
      }
    }
    
    if (pmid && title) {
      articles.push({
        pmid,
        title: cleanXMLText(title),
        authors,
        journal: cleanXMLText(journal || ''),
        year: year || '',
        volume,
        issue,
        pages,
        doi,
        abstract: abstract ? cleanXMLText(abstract) : undefined,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
      })
    }
  }
  
  return articles
}

/**
 * Extract value from XML by tag name
 */
function extractXMLValue(xml: string, tagName: string, ...parentTags: string[]): string | undefined {
  let searchXml = xml
  
  // Navigate through parent tags if provided
  for (const parentTag of parentTags) {
    const parentMatch = searchXml.match(new RegExp(`<${parentTag}[^>]*>([\\s\\S]*?)</${parentTag}>`, 'i'))
    if (parentMatch) {
      searchXml = parentMatch[1]
    }
  }
  
  const match = searchXml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'))
  return match ? match[1].trim() : undefined
}

/**
 * Clean XML text (remove CDATA, decode entities, etc.)
 */
function cleanXMLText(text: string): string {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

/**
 * Search PubMed by DOI
 */
export async function searchPubMedByDOI(doi: string): Promise<PubMedArticle | null> {
  // Remove 'doi:' prefix if present
  const cleanDOI = doi.replace(/^doi:/i, '').trim()
  const query = `${cleanDOI}[DOI]`
  const result = await searchPubMed(query, 1)
  return result.articles[0] || null
}

/**
 * Search PubMed by title (fuzzy match)
 */
export async function searchPubMedByTitle(title: string): Promise<PubMedArticle | null> {
  const query = `"${title}"[Title]`
  const result = await searchPubMed(query, 1)
  return result.articles[0] || null
}

