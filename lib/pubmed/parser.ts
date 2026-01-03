/**
 * Enhanced PubMed XML Parser
 * 
 * Extracts full metadata from PubMed XML including:
 * - Structured abstracts
 * - MeSH headings
 * - Publication types
 * - Chemicals/drugs
 * - Keywords
 * 
 * This metadata is CRITICAL for medical-context-aware chunking.
 */

import type {
  EnhancedPubMedArticle,
  Author,
  JournalInfo,
  PublicationDate,
  AbstractSection,
  MeshHeading,
  PublicationType,
  Chemical,
  EvidenceLevel,
} from './types';
import { classifyEvidenceLevel } from './evidence-classifier';

/**
 * Parse PubMed XML response into enhanced article objects
 */
export function parseEnhancedPubMedXML(xmlText: string): EnhancedPubMedArticle[] {
  const articles: EnhancedPubMedArticle[] = [];
  
  // Match each PubmedArticle element
  const articleMatches = xmlText.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g);
  
  for (const match of articleMatches) {
    try {
      const article = parseArticle(match[1]);
      if (article) {
        articles.push(article);
      }
    } catch (error) {
      console.error('Error parsing article:', error);
      // Continue with next article
    }
  }
  
  return articles;
}

/**
 * Parse a single PubMed article from XML
 */
function parseArticle(articleXml: string): EnhancedPubMedArticle | null {
  // Extract MedlineCitation section
  const medlineCitation = extractSection(articleXml, 'MedlineCitation');
  if (!medlineCitation) return null;
  
  // Extract PubmedData section (contains additional IDs)
  const pubmedData = extractSection(articleXml, 'PubmedData');
  
  // Core identifiers
  const pmid = extractValue(medlineCitation, 'PMID');
  if (!pmid) return null;
  
  // Extract Article section
  const articleSection = extractSection(medlineCitation, 'Article');
  if (!articleSection) return null;
  
  // Title
  const title = cleanXMLText(extractValue(articleSection, 'ArticleTitle') || '');
  if (!title) return null;
  
  // Authors
  const authors = parseAuthors(articleSection);
  
  // Journal info
  const journal = parseJournal(articleSection);
  
  // Publication date
  const publicationDate = parsePublicationDate(articleSection, medlineCitation);
  
  // Abstract (structured or unstructured)
  const { abstract, abstractSections } = parseAbstract(articleSection);
  
  // MeSH headings
  const meshHeadings = parseMeshHeadings(medlineCitation);
  
  // Publication types
  const publicationTypes = parsePublicationTypes(articleSection);
  
  // Chemicals/drugs
  const chemicals = parseChemicals(medlineCitation);
  
  // Keywords
  const keywords = parseKeywords(medlineCitation);
  
  // Extract DOI and PMC
  const doi = extractDOI(articleSection, pubmedData || undefined);
  const pmc = extractPMC(pubmedData || undefined);
  
  // Classify evidence level based on publication types
  const evidenceLevel = classifyEvidenceLevel(publicationTypes.map(pt => pt.name));
  
  // Derive study design from publication types
  const studyDesign = deriveStudyDesign(publicationTypes);
  
  // Try to extract sample size from abstract
  const sampleSize = extractSampleSize(abstract || '');
  
  return {
    pmid,
    doi,
    pmc,
    title,
    authors,
    journal,
    publicationDate,
    abstract,
    abstractSections,
    meshHeadings,
    publicationTypes,
    chemicals,
    keywords,
    sampleSize,
    studyDesign,
    evidenceLevel,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    fullTextUrl: pmc ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmc}/` : undefined,
  };
}

/**
 * Parse authors from Article section
 */
function parseAuthors(articleXml: string): Author[] {
  const authors: Author[] = [];
  const authorList = extractSection(articleXml, 'AuthorList');
  if (!authorList) return authors;
  
  const authorMatches = authorList.matchAll(/<Author[^>]*>([\s\S]*?)<\/Author>/g);
  
  for (const match of authorMatches) {
    const authorXml = match[1];
    const lastName = extractValue(authorXml, 'LastName');
    
    if (lastName) {
      authors.push({
        lastName,
        firstName: extractValue(authorXml, 'ForeName'),
        initials: extractValue(authorXml, 'Initials'),
        affiliation: extractValue(authorXml, 'Affiliation'),
        orcid: extractIdentifier(authorXml, 'ORCID'),
      });
    }
  }
  
  return authors;
}

/**
 * Parse journal information
 */
function parseJournal(articleXml: string): JournalInfo {
  const journalSection = extractSection(articleXml, 'Journal');
  const journalIssue = extractSection(journalSection || '', 'JournalIssue');
  
  return {
    title: cleanXMLText(extractValue(journalSection || '', 'Title') || 
                        extractValue(journalSection || '', 'ISOAbbreviation') || 
                        'Unknown Journal'),
    isoAbbreviation: extractValue(journalSection || '', 'ISOAbbreviation'),
    issn: extractValue(journalSection || '', 'ISSN'),
    volume: extractValue(journalIssue || '', 'Volume'),
    issue: extractValue(journalIssue || '', 'Issue'),
    pages: extractValue(articleXml, 'MedlinePgn') || extractValue(articleXml, 'Pagination'),
    nlmUniqueID: extractValue(journalSection || '', 'NlmUniqueID'),
  };
}

/**
 * Parse publication date
 */
function parsePublicationDate(articleXml: string, medlineCitation: string): PublicationDate {
  // Try ArticleDate first (electronic publication date)
  const articleDate = extractSection(articleXml, 'ArticleDate');
  if (articleDate) {
    const year = parseInt(extractValue(articleDate, 'Year') || '0', 10);
    if (year) {
      return {
        year,
        month: parseInt(extractValue(articleDate, 'Month') || '0', 10) || undefined,
        day: parseInt(extractValue(articleDate, 'Day') || '0', 10) || undefined,
      };
    }
  }
  
  // Try PubDate in Journal section
  const journalSection = extractSection(articleXml, 'Journal');
  const pubDate = extractSection(journalSection || '', 'PubDate');
  if (pubDate) {
    const year = parseInt(extractValue(pubDate, 'Year') || '0', 10);
    if (year) {
      return {
        year,
        month: parseMonth(extractValue(pubDate, 'Month')),
        day: parseInt(extractValue(pubDate, 'Day') || '0', 10) || undefined,
        medlineDate: extractValue(pubDate, 'MedlineDate'),
      };
    }
    
    // Handle MedlineDate format (e.g., "2023 Jan-Feb")
    const medlineDate = extractValue(pubDate, 'MedlineDate');
    if (medlineDate) {
      const yearMatch = medlineDate.match(/(\d{4})/);
      return {
        year: yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear(),
        medlineDate,
      };
    }
  }
  
  // Fallback to DateCompleted or DateRevised
  const dateCompleted = extractSection(medlineCitation, 'DateCompleted');
  if (dateCompleted) {
    return {
      year: parseInt(extractValue(dateCompleted, 'Year') || String(new Date().getFullYear()), 10),
      month: parseInt(extractValue(dateCompleted, 'Month') || '0', 10) || undefined,
      day: parseInt(extractValue(dateCompleted, 'Day') || '0', 10) || undefined,
    };
  }
  
  return { year: new Date().getFullYear() };
}

/**
 * Parse abstract (handles both structured and unstructured)
 */
function parseAbstract(articleXml: string): { 
  abstract?: string; 
  abstractSections?: AbstractSection[]; 
} {
  const abstractSection = extractSection(articleXml, 'Abstract');
  if (!abstractSection) return {};
  
  // Check for structured abstract (multiple AbstractText elements with Labels)
  const abstractTextMatches = [...abstractSection.matchAll(
    /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g
  )];
  
  if (abstractTextMatches.length === 0) return {};
  
  // Check if structured (has Label attributes)
  const sections: AbstractSection[] = [];
  let fullAbstract = '';
  
  for (const match of abstractTextMatches) {
    const fullTag = abstractSection.substring(
      abstractSection.indexOf(match[0]),
      abstractSection.indexOf(match[0]) + match[0].length
    );
    
    // Extract Label attribute
    const labelMatch = match[0].match(/Label="([^"]+)"/i);
    const nlmCategoryMatch = match[0].match(/NlmCategory="([^"]+)"/i);
    
    const text = cleanXMLText(match[1]);
    
    if (labelMatch) {
      sections.push({
        label: labelMatch[1],
        nlmCategory: nlmCategoryMatch?.[1],
        text,
      });
      fullAbstract += `${labelMatch[1]}: ${text}\n\n`;
    } else {
      fullAbstract += text + '\n\n';
    }
  }
  
  return {
    abstract: fullAbstract.trim(),
    abstractSections: sections.length > 1 ? sections : undefined,
  };
}

/**
 * Parse MeSH headings
 */
function parseMeshHeadings(medlineCitation: string): MeshHeading[] {
  const meshHeadings: MeshHeading[] = [];
  const meshList = extractSection(medlineCitation, 'MeshHeadingList');
  if (!meshList) return meshHeadings;
  
  const headingMatches = meshList.matchAll(/<MeshHeading>([\s\S]*?)<\/MeshHeading>/g);
  
  for (const match of headingMatches) {
    const headingXml = match[1];
    
    // Extract descriptor
    const descriptorMatch = headingXml.match(
      /<DescriptorName[^>]*UI="([^"]*)"[^>]*MajorTopicYN="([^"]*)"[^>]*>([\s\S]*?)<\/DescriptorName>/i
    );
    
    if (descriptorMatch) {
      const qualifiers: string[] = [];
      const qualifierMatches = headingXml.matchAll(
        /<QualifierName[^>]*>([\s\S]*?)<\/QualifierName>/gi
      );
      for (const qMatch of qualifierMatches) {
        qualifiers.push(cleanXMLText(qMatch[1]));
      }
      
      meshHeadings.push({
        descriptorName: cleanXMLText(descriptorMatch[3]),
        descriptorUI: descriptorMatch[1],
        qualifierNames: qualifiers.length > 0 ? qualifiers : undefined,
        majorTopic: descriptorMatch[2].toUpperCase() === 'Y',
      });
    }
  }
  
  return meshHeadings;
}

/**
 * Parse publication types
 */
function parsePublicationTypes(articleXml: string): PublicationType[] {
  const types: PublicationType[] = [];
  const typeList = extractSection(articleXml, 'PublicationTypeList');
  if (!typeList) return types;
  
  const typeMatches = typeList.matchAll(
    /<PublicationType[^>]*(?:UI="([^"]*)")?[^>]*>([\s\S]*?)<\/PublicationType>/gi
  );
  
  for (const match of typeMatches) {
    types.push({
      name: cleanXMLText(match[2]),
      ui: match[1],
    });
  }
  
  return types;
}

/**
 * Parse chemicals/drugs
 */
function parseChemicals(medlineCitation: string): Chemical[] {
  const chemicals: Chemical[] = [];
  const chemicalList = extractSection(medlineCitation, 'ChemicalList');
  if (!chemicalList) return chemicals;
  
  const chemMatches = chemicalList.matchAll(/<Chemical>([\s\S]*?)<\/Chemical>/g);
  
  for (const match of chemMatches) {
    const chemXml = match[1];
    const name = extractValue(chemXml, 'NameOfSubstance');
    if (name) {
      chemicals.push({
        name: cleanXMLText(name),
        registryNumber: extractValue(chemXml, 'RegistryNumber'),
      });
    }
  }
  
  return chemicals;
}

/**
 * Parse keywords
 */
function parseKeywords(medlineCitation: string): string[] {
  const keywords: string[] = [];
  const keywordList = extractSection(medlineCitation, 'KeywordList');
  if (!keywordList) return keywords;
  
  const keywordMatches = keywordList.matchAll(/<Keyword[^>]*>([\s\S]*?)<\/Keyword>/gi);
  
  for (const match of keywordMatches) {
    const keyword = cleanXMLText(match[1]);
    if (keyword) {
      keywords.push(keyword);
    }
  }
  
  return keywords;
}

/**
 * Extract DOI from various locations
 */
function extractDOI(articleXml: string, pubmedData?: string): string | undefined {
  // Try ELocationID with EIdType="doi"
  const elocationMatch = articleXml.match(
    /<ELocationID[^>]*EIdType="doi"[^>]*>([\s\S]*?)<\/ELocationID>/i
  );
  if (elocationMatch) {
    return cleanXMLText(elocationMatch[1]);
  }
  
  // Try ArticleIdList in PubmedData
  if (pubmedData) {
    const doiMatch = pubmedData.match(
      /<ArticleId[^>]*IdType="doi"[^>]*>([\s\S]*?)<\/ArticleId>/i
    );
    if (doiMatch) {
      return cleanXMLText(doiMatch[1]);
    }
  }
  
  return undefined;
}

/**
 * Extract PMC ID
 */
function extractPMC(pubmedData?: string): string | undefined {
  if (!pubmedData) return undefined;
  
  const pmcMatch = pubmedData.match(
    /<ArticleId[^>]*IdType="pmc"[^>]*>([\s\S]*?)<\/ArticleId>/i
  );
  
  return pmcMatch ? cleanXMLText(pmcMatch[1]) : undefined;
}

/**
 * Extract an identifier (like ORCID) from author XML
 */
function extractIdentifier(authorXml: string, idType: string): string | undefined {
  const identifierMatch = authorXml.match(
    new RegExp(`<Identifier[^>]*Source="${idType}"[^>]*>([\\s\\S]*?)<\\/Identifier>`, 'i')
  );
  return identifierMatch ? cleanXMLText(identifierMatch[1]) : undefined;
}

/**
 * Extract sample size from abstract text
 * Looks for patterns like "n=500", "N = 1,234", "500 patients", etc.
 */
function extractSampleSize(abstract: string): number | undefined {
  if (!abstract) return undefined;
  
  // Common patterns for sample size
  const patterns = [
    /\bn\s*=\s*([\d,]+)/i,                           // n=500, N = 1,234
    /\b([\d,]+)\s*(?:patients?|participants?|subjects?|individuals?)\b/i,
    /\bsample\s*(?:size)?[:\s]*(?:of\s*)?([\d,]+)/i,
    /\benrolled\s*([\d,]+)/i,
    /\bincluded\s*([\d,]+)\s*(?:patients?|participants?)/i,
  ];
  
  for (const pattern of patterns) {
    const match = abstract.match(pattern);
    if (match) {
      const size = parseInt(match[1].replace(/,/g, ''), 10);
      if (size > 0 && size < 10000000) { // Sanity check
        return size;
      }
    }
  }
  
  return undefined;
}

/**
 * Derive study design from publication types
 */
function deriveStudyDesign(publicationTypes: PublicationType[]): string | undefined {
  const typeNames = publicationTypes.map(pt => pt.name.toLowerCase());
  
  if (typeNames.some(t => t.includes('meta-analysis'))) return 'Meta-Analysis';
  if (typeNames.some(t => t.includes('systematic review'))) return 'Systematic Review';
  if (typeNames.some(t => t.includes('randomized controlled'))) return 'RCT';
  if (typeNames.some(t => t.includes('clinical trial'))) return 'Clinical Trial';
  if (typeNames.some(t => t.includes('cohort'))) return 'Cohort Study';
  if (typeNames.some(t => t.includes('case-control'))) return 'Case-Control';
  if (typeNames.some(t => t.includes('case report'))) return 'Case Report';
  if (typeNames.some(t => t.includes('review'))) return 'Review';
  if (typeNames.some(t => t.includes('guideline'))) return 'Clinical Guideline';
  
  return undefined;
}

/**
 * Parse month string to number
 */
function parseMonth(month?: string): number | undefined {
  if (!month) return undefined;
  
  const monthNum = parseInt(month, 10);
  if (monthNum >= 1 && monthNum <= 12) return monthNum;
  
  const monthMap: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  
  return monthMap[month.toLowerCase()];
}

// ============ Helper Functions ============

/**
 * Extract a section from XML
 */
function extractSection(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

/**
 * Extract a value from XML
 */
function extractValue(xml: string, tagName: string): string | undefined {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * Clean XML text (decode entities, remove CDATA, etc.)
 */
function cleanXMLText(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/<[^>]+>/g, '') // Remove any remaining XML tags
    .trim();
}

