import * as pdfjsLib from "pdfjs-dist"
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs"
import { parseSrcParam } from "./parse-src-param"
import "pdfjs-dist/web/pdf_viewer.css"
import "./style.css"

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString()

async function boot() {
  const src = parseSrcParam(location.search)
  if (!src) {
    document.body.textContent = "Missing ?src= parameter"
    return
  }

  const container = document.getElementById("viewer-container")
  if (!container)
    return

  const eventBus = new EventBus()
  const linkService = new PDFLinkService({ eventBus })
  const viewer = new PDFViewer({
    container: container as HTMLDivElement,
    eventBus,
    linkService,
  })
  linkService.setViewer(viewer)

  const loadingTask = pdfjsLib.getDocument({ url: src })
  const pdfDoc = await loadingTask.promise
  viewer.setDocument(pdfDoc)
  linkService.setDocument(pdfDoc)
}

boot().catch((err) => {
  document.body.textContent = `Failed to load PDF: ${err instanceof Error ? err.message : String(err)}`
})
