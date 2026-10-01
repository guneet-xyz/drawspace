import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Drawspace — a little space for big ideas',
    template: '%s · Drawspace',
  },
  description:
    'Your self-hosted home for sketches, diagrams, and shared ideas. Powered by the open-source Excalidraw editor.',
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster richColors position="bottom-right" closeButton />
      </body>
    </html>
  )
}
