/**
 * Healthcare Data Anonymization Module
 * 
 * This module removes PII (Personally Identifiable Information) and PHI
 * (Protected Health Information) from user messages before sending to LLM providers.
 * 
 * HIPAA Compliance: Ensures no identifiable health information is sent to third-party LLMs.
 */

// Common PII patterns
const PII_PATTERNS = {
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // Phone numbers (various formats)
  phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  
  // Social Security Numbers
  ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  
  // Credit card numbers
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  
  // IP addresses
  ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  
  // URLs
  url: /https?:\/\/[^\s]+/g,
  
  // Dates (various formats) - be careful not to remove medical dates
  date: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
  
  // Years (4 digits, but not in medical contexts)
  year: /\b(19|20)\d{2}\b/g,
  
  // ZIP codes
  zipCode: /\b\d{5}(-\d{4})?\b/g,
  
  // Medical record numbers (common patterns)
  medicalRecord: /\bMRN[:\s]?\d+\b/gi,
  medicalRecordAlt: /\bMR[:\s]?\d+\b/gi,
  
  // Account numbers
  accountNumber: /\b(?:Account|Acct|Acc)[:\s#]?\d+\b/gi,
};

// Common name patterns (first/last names)
const NAME_PATTERNS = [
  // Common first names (top 100)
  /\b(James|John|Robert|Michael|William|David|Richard|Joseph|Thomas|Charles|Christopher|Daniel|Matthew|Anthony|Mark|Donald|Steven|Paul|Andrew|Joshua|Kenneth|Kevin|Brian|George|Edward|Ronald|Timothy|Jason|Jeffrey|Ryan|Jacob|Gary|Nicholas|Eric|Jonathan|Stephen|Larry|Justin|Scott|Brandon|Benjamin|Samuel|Frank|Gregory|Raymond|Alexander|Patrick|Jack|Dennis|Jerry|Tyler|Aaron|Jose|Henry|Adam|Douglas|Nathan|Zachary|Kyle|Noah|Ethan|Jeremy|Christian|Walter|Keith|Roger|Terry|Austin|Sean|Gerald|Carl|Harold|Dylan|Jesse|Jordan|Bryan|Ray|Ralph|Roy|Eugene|Wayne|Louis|Philip|Bobby|Johnny|Willie|Mary|Patricia|Jennifer|Linda|Barbara|Elizabeth|Susan|Jessica|Sarah|Karen|Nancy|Lisa|Betty|Margaret|Sandra|Ashley|Kimberly|Emily|Donna|Michelle|Dorothy|Carol|Amanda|Melissa|Deborah|Stephanie|Rebecca|Sharon|Laura|Cynthia|Kathleen|Amy|Angela|Shirley|Anna|Brenda|Pamela|Emma|Nicole|Helen|Samantha|Katherine|Christine|Debra|Rachel|Carolyn|Janet|Virginia|Maria|Heather|Diane|Julie|Joyce|Victoria|Kelly|Christina|Joan|Evelyn|Judith|Megan|Cheryl|Andrea|Hannah|Jacqueline|Martha|Gloria|Teresa|Sara|Janice|Marie|Julia|Grace|Judy|Theresa|Madison|Beverly|Denise|Marilyn|Amber|Danielle|Brittany|Diana|Abigail|Jane|Lori|Kathryn|Alexis|Tiffany|Kayla)\b/gi,
];

// Medical identifiers that should be anonymized
const MEDICAL_IDENTIFIERS = [
  /\b(Patient|Pt\.?)[:\s]+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/gi,
  /\b(Doctor|Dr\.?|Physician|MD|DO)[:\s]+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/gi,
  /\b(Hospital|Clinic|Medical Center|Health Center)[:\s]+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/gi,
];

// Replacement tokens
const REPLACEMENTS = {
  email: "[EMAIL_REDACTED]",
  phone: "[PHONE_REDACTED]",
  ssn: "[SSN_REDACTED]",
  creditCard: "[CARD_REDACTED]",
  ipAddress: "[IP_REDACTED]",
  url: "[URL_REDACTED]",
  date: "[DATE_REDACTED]",
  year: "[YEAR_REDACTED]",
  zipCode: "[ZIP_REDACTED]",
  medicalRecord: "[MRN_REDACTED]",
  medicalRecordAlt: "[MR_REDACTED]",
  accountNumber: "[ACCOUNT_REDACTED]",
  name: "[NAME_REDACTED]",
  medicalIdentifier: "[MEDICAL_ID_REDACTED]",
};

/**
 * Anonymize a single text string by removing PII
 */
export function anonymizeText(text: string): string {
  if (!text || typeof text !== "string") {
    return text
  }

  let anonymized = text

  // Remove email addresses
  anonymized = anonymized.replace(PII_PATTERNS.email, REPLACEMENTS.email)

  // Remove phone numbers
  anonymized = anonymized.replace(PII_PATTERNS.phone, REPLACEMENTS.phone)

  // Remove SSNs
  anonymized = anonymized.replace(PII_PATTERNS.ssn, REPLACEMENTS.ssn)

  // Remove credit card numbers
  anonymized = anonymized.replace(PII_PATTERNS.creditCard, REPLACEMENTS.creditCard)

  // Remove IP addresses
  anonymized = anonymized.replace(PII_PATTERNS.ipAddress, REPLACEMENTS.ipAddress)

  // Remove URLs (but keep domain names for medical references)
  anonymized = anonymized.replace(PII_PATTERNS.url, REPLACEMENTS.url)

  // Remove ZIP codes
  anonymized = anonymized.replace(PII_PATTERNS.zipCode, REPLACEMENTS.zipCode)

  // Remove medical record numbers
  anonymized = anonymized.replace(PII_PATTERNS.medicalRecord, REPLACEMENTS.medicalRecord)
  anonymized = anonymized.replace(PII_PATTERNS.medicalRecordAlt, REPLACEMENTS.medicalRecordAlt)

  // Remove account numbers
  anonymized = anonymized.replace(PII_PATTERNS.accountNumber, REPLACEMENTS.accountNumber)

  // Remove medical identifiers (patient names, doctor names, etc.)
  for (const pattern of MEDICAL_IDENTIFIERS) {
    anonymized = anonymized.replace(pattern, REPLACEMENTS.medicalIdentifier)
  }

  // Remove common names (be conservative - only remove if clearly a name)
  for (const pattern of NAME_PATTERNS) {
    // Only replace if it looks like a name in context (capitalized, not part of medical terms)
    anonymized = anonymized.replace(pattern, (match, offset, string) => {
      // Check if it's at the start of sentence or after common name prefixes
      const before = string.substring(Math.max(0, offset - 20), offset)
      const after = string.substring(offset + match.length, Math.min(string.length, offset + match.length + 20))
      
      // If it's clearly a name context (after "I am", "My name is", "Patient:", etc.)
      if (/^(I am|My name is|Patient|Name|Called|Known as)/i.test(before.trim()) ||
          /^(is|was|are|were|has|had)/i.test(after.trim())) {
        return REPLACEMENTS.name
      }
      
      // If it's part of a medical term, don't replace
      if (/^(disease|syndrome|disorder|condition|medication|drug|treatment)/i.test(after.trim())) {
        return match
      }
      
      return match
    })
  }

  // Remove dates (but be careful with medical dates - only remove if clearly PII)
  // We'll be conservative and only remove dates that look like birth dates or personal dates
  anonymized = anonymized.replace(PII_PATTERNS.date, (match, offset, string) => {
    const context = string.substring(Math.max(0, offset - 30), Math.min(string.length, offset + match.length + 30)).toLowerCase()
    
    // If it's clearly a birth date or personal date context
    if (/(born|birth|dob|date of birth|age|years old|since)/i.test(context)) {
      return REPLACEMENTS.date
    }
    
    // If it's a medical date (symptom onset, diagnosis, etc.), keep it but anonymize the year
    if (/(symptom|diagnosis|onset|started|began|since|when)/i.test(context)) {
      // Keep the date but remove the year if it's a full date
      return match.replace(/\d{4}$/, "[YEAR]")
    }
    
    return match
  })

  // Remove years that might be birth years (1900-2010 range, in personal contexts)
  anonymized = anonymized.replace(PII_PATTERNS.year, (match, offset, string) => {
    const context = string.substring(Math.max(0, offset - 30), Math.min(string.length, offset + match.length + 30)).toLowerCase()
    const year = parseInt(match)
    
    // If it's a birth year in personal context
    if ((year >= 1920 && year <= 2010) && /(born|birth|dob|age|years old)/i.test(context)) {
      return REPLACEMENTS.year
    }
    
    return match
  })

  return anonymized
}

/**
 * Anonymize message content (handles both string and array formats)
 */
export function anonymizeMessage(message: { content: string | any[]; role: string }): { content: string | any[]; role: string } {
  if (!message || !message.content) {
    return message
  }

  // Handle string content
  if (typeof message.content === "string") {
    return {
      ...message,
      content: anonymizeText(message.content),
    }
  }

  // Handle array content (for messages with multiple parts)
  if (Array.isArray(message.content)) {
    return {
      ...message,
      content: message.content.map((part: any) => {
        if (part.type === "text" && typeof part.text === "string") {
          return {
            ...part,
            text: anonymizeText(part.text),
          }
        }
        // For image parts or other types, keep as-is but anonymize any text fields
        if (part.text && typeof part.text === "string") {
          return {
            ...part,
            text: anonymizeText(part.text),
          }
        }
        return part
      }),
    }
  }

  return message
}

/**
 * Anonymize an array of messages before sending to LLM
 */
export function anonymizeMessages(messages: Array<{ content: string | any[]; role: string }>): Array<{ content: string | any[]; role: string }> {
  if (!messages || !Array.isArray(messages)) {
    return messages
  }

  return messages.map((message) => {
    // Only anonymize user messages - assistant messages and system prompts are already anonymized
    if (message.role === "user") {
      return anonymizeMessage(message)
    }
    return message
  })
}

/**
 * Check if text contains potential PII
 */
export function containsPII(text: string): boolean {
  if (!text || typeof text !== "string") {
    return false
  }

  // Check for any PII patterns
  for (const pattern of Object.values(PII_PATTERNS)) {
    if (pattern.test(text)) {
      return true
    }
  }

  // Check for medical identifiers
  for (const pattern of MEDICAL_IDENTIFIERS) {
    if (pattern.test(text)) {
      return true
    }
  }

  return false
}






