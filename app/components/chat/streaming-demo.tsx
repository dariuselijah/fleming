import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StreamingProgress, StreamingMetrics } from "./streaming-progress"
import { useStreaming } from "./use-streaming"

// Demo queries to showcase different streaming behaviors
const DEMO_QUERIES = [
  {
    name: "Simple Query",
    query: "Hello, how are you today?",
    description: "Short, simple query that uses larger chunks and faster streaming"
  },
  {
    name: "Complex Medical Query",
    query: "What is the differential diagnosis for a patient presenting with chest pain, shortness of breath, and diaphoresis? Please include the most common causes and red flags that require immediate attention.",
    description: "Complex medical query that uses smaller chunks and slower, more careful streaming"
  },
  {
    name: "Long Technical Query",
    query: "Explain the differences between streaming and blocking UIs in the context of large language model applications. Include performance considerations, user experience implications, and implementation strategies for both approaches.",
    description: "Long technical query that demonstrates adaptive chunking"
  }
]

export function StreamingDemo() {
  const [selectedQuery, setSelectedQuery] = useState(0)
  const [isDemoRunning, setIsDemoRunning] = useState(false)
  const [demoMetrics, setDemoMetrics] = useState<any>(null)
  
  const {
    streamingState,
    startStreaming,
    processChunk,
    stopStreaming,
    getStreamingMetrics,
    getStreamingConfig,
  } = useStreaming()

  const runDemo = async () => {
    const query = DEMO_QUERIES[selectedQuery]
    setIsDemoRunning(true)
    setDemoMetrics(null)
    
    // Start streaming
    startStreaming(query.query)
    
    // Simulate streaming chunks
    const config = getStreamingConfig(query.query)
    const chunks = generateDemoChunks(query.query, config.chunkSize)
    
    for (let i = 0; i < chunks.length; i++) {
      await new Promise(resolve => setTimeout(resolve, config.minDelay + Math.random() * (config.maxDelay - config.minDelay)))
      processChunk(chunks[i])
    }
    
    // Stop streaming and get metrics
    stopStreaming()
    const metrics = getStreamingMetrics()
    setDemoMetrics(metrics)
    setIsDemoRunning(false)
  }

  const generateDemoChunks = (text: string, chunkSize: number) => {
    const words = text.split(' ')
    const chunks = []
    
    for (let i = 0; i < words.length; i += chunkSize) {
      chunks.push(words.slice(i, i + chunkSize).join(' '))
    }
    
    return chunks
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Enhanced Streaming Demo</h1>
        <p className="text-muted-foreground">
          Experience the improved streaming UI with adaptive chunking and real-time performance metrics
        </p>
      </div>

      {/* Query Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Demo Query</CardTitle>
          <CardDescription>
            Choose a query type to see how streaming adapts based on complexity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {DEMO_QUERIES.map((query, index) => (
            <div
              key={index}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedQuery === index
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                  : 'border-border hover:border-blue-300'
              }`}
              onClick={() => setSelectedQuery(index)}
            >
              <h3 className="font-semibold mb-1">{query.name}</h3>
              <p className="text-sm text-muted-foreground mb-2">{query.description}</p>
              <p className="text-xs font-mono bg-muted p-2 rounded">
                "{query.query.substring(0, 100)}{query.query.length > 100 ? '...' : ''}"
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Streaming Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Streaming Configuration</CardTitle>
          <CardDescription>
            Configuration automatically optimized based on query complexity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Query Type:</span>
              <span className="ml-2">{DEMO_QUERIES[selectedQuery].name}</span>
            </div>
            <div>
              <span className="font-medium">Complexity:</span>
              <span className="ml-2">
                {getStreamingConfig(DEMO_QUERIES[selectedQuery].query).chunkSize <= 10 ? 'Complex' : 'Simple'}
              </span>
            </div>
            <div>
              <span className="font-medium">Chunk Size:</span>
              <span className="ml-2">{getStreamingConfig(DEMO_QUERIES[selectedQuery].query).chunkSize} words</span>
            </div>
            <div>
              <span className="font-medium">Min Delay:</span>
              <span className="ml-2">{getStreamingConfig(DEMO_QUERIES[selectedQuery].query).minDelay}ms</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Demo Controls */}
      <div className="flex justify-center">
        <Button
          onClick={runDemo}
          disabled={isDemoRunning}
          className="px-8"
        >
          {isDemoRunning ? 'Running Demo...' : 'Run Streaming Demo'}
        </Button>
      </div>

      {/* Streaming Progress */}
      {isDemoRunning && (
        <Card>
          <CardHeader>
            <CardTitle>Live Streaming Progress</CardTitle>
            <CardDescription>
              Real-time streaming with adaptive chunking and performance tracking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StreamingProgress
              isStreaming={streamingState.isStreaming}
              progress={streamingState.progress}
              estimatedTimeRemaining={streamingState.estimatedTimeRemaining}
              chunksReceived={streamingState.chunksReceived}
            />
          </CardContent>
        </Card>
      )}

      {/* Performance Metrics */}
      {demoMetrics && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
            <CardDescription>
              Detailed performance analysis of the streaming session
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StreamingMetrics metrics={demoMetrics} />
          </CardContent>
        </Card>
      )}

      {/* Benefits Showcase */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Enhanced User Experience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-sm">Real-time response display</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-sm">Adaptive chunking based on query complexity</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-sm">Visual progress indicators</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-sm">Performance metrics tracking</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Technical Improvements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <span className="text-sm">Optimized chunk sizes for different query types</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <span className="text-sm">Network latency adaptation</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <span className="text-sm">Enhanced error handling</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <span className="text-sm">Accessibility improvements</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 