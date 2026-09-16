"use client"

import { createContext, useContext } from "react"

export type DocumentCanvasContextValue = {
  /** Clinical workspace: conversation hidden, documents + input only */
  documentLayout: boolean
}

const DocumentCanvasContext = createContext<DocumentCanvasContextValue>({
  documentLayout: false,
})

export function DocumentCanvasProvider({
  documentLayout,
  children,
}: {
  documentLayout: boolean
  children: React.ReactNode
}) {
  return (
    <DocumentCanvasContext.Provider value={{ documentLayout }}>
      {children}
    </DocumentCanvasContext.Provider>
  )
}

export function useDocumentCanvas() {
  return useContext(DocumentCanvasContext)
}
