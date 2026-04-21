export const metadata = {
  title: "GetU Translate",
  description: "懂你翻译 — understand any webpage in your native language",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
