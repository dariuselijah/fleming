declare module "pdf-parse/lib/pdf-parse.js" {
  import PdfParse = require("pdf-parse")
  export = PdfParse
}

declare module "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js" {
  const pdfjs: any
  export = pdfjs
  export const OPS: Record<string, number>
  export function getDocument(params: any): any
}
