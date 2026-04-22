import Link from "next/link"
import { SiteShell } from "./components"

export default function HomePage() {
  return (
    <SiteShell>
      <section className="home-hero">
        <div>
          <p className="eyebrow">Browser translation for serious reading</p>
          <h1>GetU Translate</h1>
          <p>
            Understand web pages, selected text, articles, and video subtitles with AI-powered bilingual translation built for language learners.
          </p>
          <div className="cta-row">
            <Link className="button primary" href="/price">View pricing</Link>
            <Link className="button secondary" href="/privacy">Read privacy policy</Link>
          </div>
        </div>
        <aside className="product-panel" aria-label="Product capabilities">
          <h2>What it includes</h2>
          <ul className="signal-list">
            <li>Immersive bilingual web page translation</li>
            <li>Selection translation and reading assistance</li>
            <li>YouTube, Netflix, and web video subtitle translation</li>
            <li>Text-to-speech and customizable AI provider settings</li>
          </ul>
        </aside>
      </section>

      <section className="feature-band" aria-label="Product highlights">
        <div>
          <h2>Designed for learners</h2>
          <p>Keep original and translated text side by side so context stays visible while you read.</p>
        </div>
        <div>
          <h2>Works where you read</h2>
          <p>Translate pages, selected text, long articles, and video subtitles directly in the browser.</p>
        </div>
        <div>
          <h2>Configurable AI</h2>
          <p>Use supported AI providers and prompts that match your reading and study workflow.</p>
        </div>
      </section>
    </SiteShell>
  )
}
