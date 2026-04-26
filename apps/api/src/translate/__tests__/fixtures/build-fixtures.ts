import { PDFDocument, StandardFonts } from "pdf-lib"
import { writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

async function helloWorld() {
  const doc = await PDFDocument.create()
  const page = doc.addPage()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText("Hello, world!", { x: 50, y: 750, font, size: 18 })
  page.drawText("This is page one.", { x: 50, y: 720, font, size: 14 })
  doc.addPage() // empty second page
  const bytes = await doc.save()
  writeFileSync(resolve(__dirname, "hello-world.pdf"), bytes)
}

async function scanned() {
  const doc = await PDFDocument.create()
  doc.addPage() // empty page = no text extractable
  const bytes = await doc.save()
  writeFileSync(resolve(__dirname, "scanned-image.pdf"), bytes)
}

await helloWorld()
await scanned()
console.log("fixtures built")
