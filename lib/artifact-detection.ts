export interface ArtifactDetectionResult {
  shouldCreateArtifact: boolean
  title: string
  contentType: 'text' | 'markdown' | 'code' | 'summary' | 'analysis' | 'report'
  confidence: number
  reasoning: string
}

export interface ArtifactContent {
  title: string
  content: string
  contentType: string
  metadata?: Record<string, any>
}

export class ArtifactDetectionService {
  private static readonly ARTIFACT_PATTERNS = {
    // Content that should become artifacts
    essay: {
      patterns: [
        /write.*essay/i,
        /create.*essay/i,
        /draft.*essay/i,
        /compose.*essay/i,
        /essay.*about/i,
        /essay.*on/i,
        /write.*about/i,
        /create.*about/i,
        /write.*on/i,
        /create.*on/i
      ],
      contentType: 'text' as const,
      confidence: 0.95
    },
    code: {
      patterns: [
        /write.*code/i,
        /create.*code/i,
        /generate.*code/i,
        /show.*code/i,
        /provide.*code/i,
        /example.*code/i,
        /function.*code/i,
        /class.*code/i,
        /script.*code/i
      ],
      contentType: 'code' as const,
      confidence: 0.95
    },
    summary: {
      patterns: [
        /summarize/i,
        /summary/i,
        /sum up/i,
        /brief.*overview/i,
        /key points/i,
        /main points/i
      ],
      contentType: 'summary' as const,
      confidence: 0.85
    },
    analysis: {
      patterns: [
        /analyze/i,
        /analysis/i,
        /break down/i,
        /examine/i,
        /evaluate/i,
        /assess/i,
        /review/i
      ],
      contentType: 'analysis' as const,
      confidence: 0.8
    },
    report: {
      patterns: [
        /write.*report/i,
        /create.*report/i,
        /generate.*report/i,
        /draft.*report/i
      ],
      contentType: 'report' as const,
      confidence: 0.9
    },
    markdown: {
      patterns: [
        /markdown/i,
        /format.*document/i,
        /create.*document/i,
        /write.*document/i
      ],
      contentType: 'markdown' as const,
      confidence: 0.8
    }
  }

  private static readonly CONTENT_LENGTH_THRESHOLDS = {
    MIN_LENGTH: 100, // Minimum characters to consider for artifact
    IDEAL_LENGTH: 300, // Ideal length for artifact creation
    MAX_LENGTH: 5000 // Maximum length before it becomes unwieldy
  }

  /**
   * Detects if the given user prompt and AI response should create an artifact
   */
  static detectArtifactOpportunity(
    userPrompt: string,
    aiResponse: string,
    conversationContext?: string[]
  ): ArtifactDetectionResult {
    const userPromptLower = userPrompt.toLowerCase()
    const aiResponseLower = aiResponse.toLowerCase()
    
    // Check if user explicitly requested artifact creation
    if (this.isExplicitArtifactRequest(userPromptLower)) {
      return {
        shouldCreateArtifact: true,
        title: this.generateArtifactTitle(userPrompt, aiResponse),
        contentType: this.detectContentType(userPromptLower, aiResponse),
        confidence: 0.95,
        reasoning: "User explicitly requested artifact creation"
      }
    }

    // Check for implicit artifact opportunities
    const implicitResult = this.detectImplicitArtifact(userPromptLower, aiResponse)
    if (implicitResult.shouldCreateArtifact) {
      return implicitResult
    }

    // Check content length and quality
    const lengthResult = this.assessContentLength(aiResponse)
    if (lengthResult.shouldCreateArtifact) {
      return {
        ...lengthResult,
        title: this.generateArtifactTitle(userPrompt, aiResponse),
        contentType: this.detectContentType(userPromptLower, aiResponse)
      }
    }

    return {
      shouldCreateArtifact: false,
      title: "",
      contentType: 'text',
      confidence: 0,
      reasoning: "No artifact opportunity detected"
    }
  }

  /**
   * Checks if user explicitly requested artifact creation
   */
  private static isExplicitArtifactRequest(userPrompt: string): boolean {
    const explicitPatterns = [
      /save.*as.*artifact/i,
      /create.*artifact/i,
      /make.*artifact/i,
      /generate.*artifact/i,
      /save.*this/i,
      /keep.*this/i,
      /store.*this/i
    ]
    
    return explicitPatterns.some(pattern => pattern.test(userPrompt))
  }

  /**
   * Detects implicit artifact opportunities based on content patterns
   */
  private static detectImplicitArtifact(
    userPrompt: string,
    aiResponse: string
  ): ArtifactDetectionResult {
    let bestMatch: ArtifactDetectionResult | null = null
    let highestConfidence = 0

    for (const [type, config] of Object.entries(this.ARTIFACT_PATTERNS)) {
      for (const pattern of config.patterns) {
        if (pattern.test(userPrompt)) {
          const confidence = config.confidence
          
          if (confidence > highestConfidence) {
            highestConfidence = confidence
                         bestMatch = {
               shouldCreateArtifact: true,
               title: this.generateArtifactTitle(userPrompt, aiResponse),
               contentType: config.contentType,
               confidence,
               reasoning: `Detected ${type} pattern in user prompt`
             }
          }
        }
      }
    }

    return bestMatch || {
      shouldCreateArtifact: false,
      title: "",
      contentType: 'text',
      confidence: 0,
      reasoning: "No implicit artifact pattern detected"
    }
  }

  /**
   * Assesses if content length warrants artifact creation
   */
  private static assessContentLength(content: string): ArtifactDetectionResult {
    const length = content.length
    
    if (length < this.CONTENT_LENGTH_THRESHOLDS.MIN_LENGTH) {
      return {
        shouldCreateArtifact: false,
        title: "",
        contentType: 'text',
        confidence: 0,
        reasoning: `Content too short (${length} chars) for artifact`
      }
    }

    if (length >= this.CONTENT_LENGTH_THRESHOLDS.IDEAL_LENGTH) {
      return {
        shouldCreateArtifact: true,
        title: "Generated Content",
        contentType: 'text',
        confidence: 0.7,
        reasoning: `Content length (${length} chars) is ideal for artifact creation`
      }
    }

    if (length >= this.CONTENT_LENGTH_THRESHOLDS.MIN_LENGTH) {
      return {
        shouldCreateArtifact: true,
        title: "Generated Content",
        contentType: 'text',
        confidence: 0.5,
        reasoning: `Content length (${length} chars) meets minimum threshold for artifact`
      }
    }

    return {
      shouldCreateArtifact: false,
      title: "",
      contentType: 'text',
      confidence: 0,
      reasoning: "Content length assessment failed"
    }
  }

  /**
   * Detects the most appropriate content type for the artifact
   */
  private static detectContentType(userPrompt: string, aiResponse: string): 'text' | 'markdown' | 'code' | 'summary' | 'analysis' | 'report' {
    // Check for code patterns
    if (/\b(function|class|const|let|var|if|for|while|return|import|export)\b/i.test(aiResponse)) {
      return 'code'
    }

    // Check for markdown patterns
    if (/#{1,6}\s|\[.*\]\(.*\)|\*\*.*\*\*|\*.*\*|```/i.test(aiResponse)) {
      return 'markdown'
    }

    // Check for structured content
    if (/\d+\.\s|•\s|-\s|\*\s/i.test(aiResponse)) {
      return 'text'
    }

    // Default to text
    return 'text'
  }

  /**
   * Generates an appropriate title for the artifact
   */
  private static generateArtifactTitle(userPrompt: string, aiResponse: string): string {
    // Try to extract a title from the user prompt
    const promptWords = userPrompt.split(' ').slice(0, 8).join(' ')
    if (promptWords.length > 10 && promptWords.length < 60) {
      return promptWords.charAt(0).toUpperCase() + promptWords.slice(1)
    }

    // Try to extract from AI response (first line or first sentence)
    const firstLine = aiResponse.split('\n')[0].trim()
    if (firstLine.length > 10 && firstLine.length < 80) {
      return firstLine
    }

    // Fallback to a generic title
    return "Generated Content"
  }

  /**
   * Extracts the main content for the artifact
   */
  static extractArtifactContent(
    aiResponse: string,
    contentType: string
  ): string {
    // Remove any system messages or metadata
    let cleanContent = aiResponse
      .replace(/^System:.*$/gm, '')
      .replace(/^Assistant:.*$/gm, '')
      .trim()

    // For code, try to extract just the code blocks
    if (contentType === 'code') {
      const codeBlocks = cleanContent.match(/```[\s\S]*?```/g)
      if (codeBlocks && codeBlocks.length > 0) {
        return codeBlocks.join('\n\n')
      }
    }

    // For markdown, ensure proper formatting
    if (contentType === 'markdown') {
      // Ensure the content starts with a heading if it doesn't have one
      if (!cleanContent.startsWith('#')) {
        cleanContent = `# Generated Content\n\n${cleanContent}`
      }
    }

    return cleanContent
  }
}
