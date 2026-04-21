import { LinkMarkdown } from "@/app/components/chat/link-markdown"
import {
  ChatChartBundle,
  parseChartSpecs,
  type ChartDrilldownPayload,
} from "@/app/components/charts/chat-chart"
import { MermaidBlock } from "@/components/prompt-kit/mermaid-block"
import { cn } from "@/lib/utils"
import { marked } from "marked"
import { memo, useId, useMemo } from "react"
import ReactMarkdown, { Components } from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { ButtonCopy } from "../common/button-copy"
import {
  CodeBlock,
  CodeBlockCode,
  CodeBlockGroup,
} from "../prompt-kit/code-block"

export type MarkdownProps = {
  children: string
  id?: string
  className?: string
  components?: Partial<Components>
  onChartDrilldown?: (payload: ChartDrilldownPayload) => void
}

// Optimized parsing with caching for streaming performance
const parseMarkdownIntoBlocks = (() => {
  const cache = new Map<string, string[]>()
  
  return (markdown: string): string[] => {
    // Use cached result if available
    if (cache.has(markdown)) {
      return cache.get(markdown)!
    }
    
    const tokens = marked.lexer(markdown)
    const blocks = tokens.map((token) => token.raw)
    
    // Cache result for performance
    cache.set(markdown, blocks)
    
    // Limit cache size to prevent memory issues
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value
      if (firstKey) {
        cache.delete(firstKey)
      }
    }
    
    return blocks
  }
})()

function extractLanguage(className?: string): string {
  if (!className) return "plaintext"
  const match = className.match(/language-([A-Za-z0-9_-]+)/)
  return match ? match[1] : "plaintext"
}

function isChartLanguage(language: string): boolean {
  return (
    language === "chart" ||
    language === "chartjson" ||
    language === "healthchart" ||
    language === "chart-spec"
  )
}

function isMermaidLanguage(language: string): boolean {
  return language === "mermaid"
}

function buildInitialComponents(
  onChartDrilldown?: (payload: ChartDrilldownPayload) => void
): Partial<Components> {
  return {
    code: function CodeComponent({ className, children, ...props }) {
      const isInline =
        !props.node?.position?.start.line ||
        props.node?.position?.start.line === props.node?.position?.end.line

      if (isInline) {
        return (
          <span
            className={cn(
              "bg-primary-foreground rounded-sm px-1 font-mono text-sm",
              className
            )}
            {...props}
          >
            {children}
          </span>
        )
      }

      const language = extractLanguage(className)
      const codeValue =
        typeof children === "string"
          ? children
          : Array.isArray(children)
            ? children.join("")
            : String(children)

      if (isMermaidLanguage(language)) {
        return <MermaidBlock code={codeValue} className="my-2" />
      }

      if (isChartLanguage(language)) {
        const chartSpecs = parseChartSpecs(codeValue)
        if (chartSpecs.length > 0) {
          return (
            <ChatChartBundle
              specs={chartSpecs}
              className="my-2"
              onDrilldown={onChartDrilldown}
            />
          )
        }
      }

      return (
        <CodeBlock className={className}>
          <CodeBlockGroup className="flex h-9 items-center justify-between px-4">
            <div className="text-muted-foreground py-1 pr-2 font-mono text-xs">
              {language}
            </div>
          </CodeBlockGroup>
          <div className="sticky top-16 lg:top-0">
            <div className="absolute right-0 bottom-0 flex h-9 items-center pr-1.5">
              <ButtonCopy code={codeValue} />
            </div>
          </div>
          <CodeBlockCode code={codeValue} language={language} />
        </CodeBlock>
      )
    },
    a: function AComponent({ href, children, ...props }) {
      if (!href) return <span {...props}>{children}</span>

      return (
        <LinkMarkdown href={href} {...props}>
          {children}
        </LinkMarkdown>
      )
    },
    pre: function PreComponent({ children }) {
      return <>{children}</>
    },
  }
}

// Optimized memoization for streaming performance
const MemoizedMarkdownBlock = memo(
  function MarkdownBlock({
    content,
    components,
  }: {
    content: string
    components: Partial<Components>
  }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    )
  },
  function propsAreEqual(prevProps, nextProps) {
    // Re-render when either content OR markdown component handlers change.
    // Citation rendering relies on dynamic component handlers, not just content.
    return (
      prevProps.content === nextProps.content &&
      prevProps.components === nextProps.components
    )
  }
)

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock"

function MarkdownComponent({
  children,
  id,
  className,
  components,
  onChartDrilldown,
}: MarkdownProps) {
  const generatedId = useId()
  const blockId = id ?? generatedId
  const baseComponents = useMemo(
    () => buildInitialComponents(onChartDrilldown),
    [onChartDrilldown]
  )
  const mergedComponents = useMemo(
    () => ({ ...baseComponents, ...(components || {}) }),
    [baseComponents, components]
  )
  
  // Optimized block parsing with useCallback to prevent unnecessary re-parsing
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children])
  
  // Memoize the block rendering to prevent unnecessary re-renders during streaming
  const renderedBlocks = useMemo(() => 
    blocks.map((block, index) => (
      <MemoizedMarkdownBlock
        key={`${blockId}-block-${index}`}
        content={block}
        components={mergedComponents}
      />
    )), [blocks, blockId, mergedComponents]
  )

  return (
    <div className={className}>
      {renderedBlocks}
    </div>
  )
}

const Markdown = memo(MarkdownComponent)
Markdown.displayName = "Markdown"

export { Markdown }
