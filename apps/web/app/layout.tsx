import "./globals.css"

export const metadata = {
  title: "GetU Translate",
  description: "AI-powered browser translation for language learners and multilingual readers.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
