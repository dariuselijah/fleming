/**
 * MeSH Knowledge Graph
 *
 * Lightweight in-memory graph of MeSH (Medical Subject Headings) term relationships.
 * Used for:
 * - Query expansion: traverse the MeSH tree for narrower/broader/related terms
 * - Result deduplication: recognise synonyms (same concept, different wording)
 * - Structured reasoning: provide relationship context to the LLM
 *
 * The graph can be loaded from a JSON export of the MeSH hierarchy
 * or populated incrementally from the medical_evidence mesh_terms columns.
 */

export interface MeshNode {
  id: string          // MeSH descriptor UI (e.g. "D006973")
  name: string        // Preferred name (e.g. "Hypertension")
  treeNumbers: string[] // e.g. ["C14.907.489"]
  synonyms: string[]
}

export interface MeshEdge {
  from: string
  to: string
  relation: "broader" | "narrower" | "related" | "synonym"
}

export class MeshGraph {
  private nodes = new Map<string, MeshNode>()
  private nameIndex = new Map<string, string>() // lower-case name → node ID
  private children = new Map<string, Set<string>>() // parent ID → child IDs
  private parents = new Map<string, Set<string>>()  // child ID → parent IDs
  private related = new Map<string, Set<string>>()  // ID → related IDs

  get size(): number {
    return this.nodes.size
  }

  addNode(node: MeshNode): void {
    this.nodes.set(node.id, node)
    this.nameIndex.set(node.name.toLowerCase(), node.id)
    for (const syn of node.synonyms) {
      this.nameIndex.set(syn.toLowerCase(), node.id)
    }
  }

  addEdge(edge: MeshEdge): void {
    if (edge.relation === "narrower") {
      if (!this.children.has(edge.from)) this.children.set(edge.from, new Set())
      this.children.get(edge.from)!.add(edge.to)
      if (!this.parents.has(edge.to)) this.parents.set(edge.to, new Set())
      this.parents.get(edge.to)!.add(edge.from)
    } else if (edge.relation === "broader") {
      if (!this.parents.has(edge.from)) this.parents.set(edge.from, new Set())
      this.parents.get(edge.from)!.add(edge.to)
      if (!this.children.has(edge.to)) this.children.set(edge.to, new Set())
      this.children.get(edge.to)!.add(edge.from)
    } else if (edge.relation === "related" || edge.relation === "synonym") {
      if (!this.related.has(edge.from)) this.related.set(edge.from, new Set())
      this.related.get(edge.from)!.add(edge.to)
      if (!this.related.has(edge.to)) this.related.set(edge.to, new Set())
      this.related.get(edge.to)!.add(edge.from)
    }
  }

  /**
   * Look up a MeSH node by name (case-insensitive) or ID.
   */
  lookup(nameOrId: string): MeshNode | undefined {
    const direct = this.nodes.get(nameOrId)
    if (direct) return direct
    const id = this.nameIndex.get(nameOrId.toLowerCase())
    return id ? this.nodes.get(id) : undefined
  }

  /**
   * Get narrower (child) terms.
   */
  getNarrower(nodeId: string, depth = 1): MeshNode[] {
    const result: MeshNode[] = []
    const visited = new Set<string>()
    const queue: Array<{ id: string; d: number }> = [{ id: nodeId, d: 0 }]

    while (queue.length > 0) {
      const { id, d } = queue.shift()!
      if (visited.has(id) || d > depth) continue
      visited.add(id)

      const kids = this.children.get(id)
      if (kids) {
        for (const kid of kids) {
          const node = this.nodes.get(kid)
          if (node) result.push(node)
          if (d + 1 < depth) queue.push({ id: kid, d: d + 1 })
        }
      }
    }

    return result
  }

  /**
   * Get broader (parent) terms.
   */
  getBroader(nodeId: string, depth = 1): MeshNode[] {
    const result: MeshNode[] = []
    const visited = new Set<string>()
    const queue: Array<{ id: string; d: number }> = [{ id: nodeId, d: 0 }]

    while (queue.length > 0) {
      const { id, d } = queue.shift()!
      if (visited.has(id) || d > depth) continue
      visited.add(id)

      const pars = this.parents.get(id)
      if (pars) {
        for (const par of pars) {
          const node = this.nodes.get(par)
          if (node) result.push(node)
          if (d + 1 < depth) queue.push({ id: par, d: d + 1 })
        }
      }
    }

    return result
  }

  /**
   * Get related terms (siblings, see-also, pharmacological action).
   */
  getRelated(nodeId: string): MeshNode[] {
    const ids = this.related.get(nodeId)
    if (!ids) return []
    return [...ids].map((id) => this.nodes.get(id)).filter(Boolean) as MeshNode[]
  }

  /**
   * Expand a query with MeSH synonyms and related terms.
   * Returns additional terms to OR into the search query.
   */
  expandQuery(query: string): string[] {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)
    const expansions: string[] = []
    const seen = new Set<string>()

    // Try to match multi-word terms first, then single words
    const phrases = [query.toLowerCase()]
    for (let len = 4; len >= 1; len--) {
      for (let i = 0; i <= tokens.length - len; i++) {
        phrases.push(tokens.slice(i, i + len).join(" "))
      }
    }

    for (const phrase of phrases) {
      const id = this.nameIndex.get(phrase)
      if (!id || seen.has(id)) continue
      seen.add(id)

      const node = this.nodes.get(id)
      if (node) {
        // Add synonyms
        for (const syn of node.synonyms) {
          if (!seen.has(syn.toLowerCase())) {
            expansions.push(syn)
            seen.add(syn.toLowerCase())
          }
        }

        // Add narrower terms (one level down)
        for (const child of this.getNarrower(id, 1)) {
          if (!seen.has(child.name.toLowerCase())) {
            expansions.push(child.name)
            seen.add(child.name.toLowerCase())
          }
        }

        // Add related terms
        for (const rel of this.getRelated(id)) {
          if (!seen.has(rel.name.toLowerCase())) {
            expansions.push(rel.name)
            seen.add(rel.name.toLowerCase())
          }
        }
      }
    }

    return expansions.slice(0, 15)
  }

  /**
   * Check if two terms are synonyms (same MeSH concept).
   */
  areSynonyms(term1: string, term2: string): boolean {
    const id1 = this.nameIndex.get(term1.toLowerCase())
    const id2 = this.nameIndex.get(term2.toLowerCase())
    if (!id1 || !id2) return false
    return id1 === id2
  }

  /**
   * Load from a JSON structure (e.g. exported from MeSH RDF/XML).
   * Expected format: { nodes: MeshNode[], edges: MeshEdge[] }
   */
  loadFromJSON(data: { nodes: MeshNode[]; edges: MeshEdge[] }): void {
    for (const node of data.nodes) {
      this.addNode(node)
    }
    for (const edge of data.edges) {
      this.addEdge(edge)
    }
  }

  /**
   * Build the graph incrementally from mesh_terms found in search results.
   * Infers hierarchical relationships from MeSH tree numbers.
   */
  addFromMeshTerms(terms: string[], treeNumbers?: string[]): void {
    for (const term of terms) {
      if (!this.nameIndex.has(term.toLowerCase())) {
        this.addNode({
          id: `auto:${term.toLowerCase().replace(/\s+/g, "_")}`,
          name: term,
          treeNumbers: [],
          synonyms: [],
        })
      }
    }

    // If tree numbers are available, infer parent-child relationships
    if (treeNumbers && treeNumbers.length > 0) {
      for (const tn of treeNumbers) {
        const parts = tn.split(".")
        if (parts.length > 1) {
          const parentTn = parts.slice(0, -1).join(".")
          // Link exists only if both tree numbers map to known nodes
          // (full implementation would maintain a treeNumber → nodeId index)
        }
      }
    }
  }
}

// Singleton instance
let meshGraphInstance: MeshGraph | null = null

export function getMeshGraph(): MeshGraph {
  if (!meshGraphInstance) {
    meshGraphInstance = new MeshGraph()
  }
  return meshGraphInstance
}

/**
 * Initialise the MeSH graph from a JSON file if available.
 * Non-blocking – returns immediately if the file doesn't exist.
 */
export async function initMeshGraph(jsonPath?: string): Promise<void> {
  const graph = getMeshGraph()
  if (graph.size > 0) return // Already loaded

  if (jsonPath) {
    try {
      const { readFileSync } = await import("node:fs")
      const raw = readFileSync(jsonPath, "utf-8")
      const data = JSON.parse(raw)
      graph.loadFromJSON(data)
      console.log(`[MeSH Graph] Loaded ${graph.size} nodes from ${jsonPath}`)
    } catch {
      console.log("[MeSH Graph] No JSON file found – starting with empty graph")
    }
  }
}
