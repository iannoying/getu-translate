import Link from "next/link"

const footerLinks = [
  { href: "/price", label: "Pricing" },
  { href: "/terms-and-conditions", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refund", label: "Refunds" },
]

const topNavLinks = [
  ...footerLinks,
  { href: "/log-in", label: "Log in" },
]

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="site-shell">
      <header className="site-header" aria-label="Main navigation">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span>GetU Translate</span>
        </Link>
        <nav className="top-nav">
          {topNavLinks.map(link => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
        </nav>
      </header>

      {children}

      <footer className="site-footer">
        <div>
          <strong>GetU Translate</strong>
          <p>AI translation tools for web pages, selected text, subtitles, and articles.</p>
        </div>
        <nav aria-label="Legal links">
          {footerLinks.map(link => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
        </nav>
      </footer>
    </main>
  )
}

export function PageHero({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="page-hero">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <div className="hero-copy">{children}</div>
    </section>
  )
}

export function PolicyPage({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <SiteShell>
      <PageHero eyebrow="Legal" title={title}>
        <p>{description}</p>
        <p className="muted">Effective date: April 22, 2026</p>
      </PageHero>
      <article className="policy-body">{children}</article>
    </SiteShell>
  )
}

export function PolicySection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  )
}
