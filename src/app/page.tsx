import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowRight,
  Check,
  FolderOpen,
  LockKeyhole,
  Sparkles,
  Users,
} from 'lucide-react'
import { getUser } from '@/lib/auth'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { IdeaPreview } from '@/components/idea-preview'

export default async function Home() {
  if (await getUser()) redirect('/app')
  return (
    <div className="min-h-dvh bg-[#fbfaf8]">
      <header className="mx-auto flex h-22 max-w-6xl items-center justify-between px-6">
        <Logo />
        <div className="flex items-center gap-3">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">
              Get started <ArrowRight />
            </Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-16">
        <section className="grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#e7e2f3] bg-[#f1eef9] px-3.5 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" /> A little space for big ideas
            </span>
            <h1 className="max-w-lg text-5xl leading-[1.12] font-semibold tracking-[-0.055em] sm:text-6xl">
              Think freely.
              <br />
              Draw together.
              <br />
              <span className="text-primary">Make it yours.</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">
              From a quick sketch to your next big plan. A calm home for your
              drawings, your team, and all the ideas in between.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Create your workspace <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/guest">Try without an account</Link>
              </Button>
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="size-3.5 text-primary" /> Open source.
              Self-hosted. Your ideas stay yours.
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-8 rounded-full bg-[#e8e1fb]/50 blur-3xl" />
            <div className="relative -rotate-2 overflow-hidden rounded-2xl border bg-white shadow-[0_24px_80px_-25px_#776ba940]">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#c0b6ed]" />
                  <span className="text-xs text-muted-foreground">
                    Something great starts here
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Your canvas, your rules
                </span>
              </div>
              <div className="dot-grid p-3">
                <IdeaPreview className="w-full" />
              </div>
              <div className="flex justify-between border-t px-5 py-3 text-[11px] text-muted-foreground">
                <span>Powered by Excalidraw</span>
                <span>∞ possibilities</span>
              </div>
            </div>
            <span className="absolute -bottom-6 right-4 rotate-3 rounded-lg border border-[#eadca8] bg-[#fff6cd] px-5 py-3 text-sm text-[#927846] shadow-sm">
              a messy idea is a good start ✨
            </span>
          </div>
        </section>
        <section className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            {
              icon: FolderOpen,
              title: 'Everything in its place',
              text: 'Organize sketches in workspaces. Save automatically and pick up right where you left off.',
            },
            {
              icon: Users,
              title: 'A space for your people',
              text: 'Bring your team in with clear owner, admin, editor, and viewer roles.',
            },
            {
              icon: LockKeyhole,
              title: 'Share on your terms',
              text: 'Create read-only links, set an expiry, and revoke access whenever you need.',
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border bg-white/70 p-6">
              <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
                <Icon className="size-5" />
              </span>
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {text}
              </p>
            </div>
          ))}
        </section>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t px-6 py-6 text-xs text-muted-foreground">
        <span>Drawspace — leave room for a little imagination.</span>
        <a
          href="https://github.com/excalidraw/excalidraw"
          target="_blank"
          rel="noreferrer"
          className="hover:text-primary"
        >
          Built with open-source Excalidraw ↗
        </a>
      </footer>
    </div>
  )
}
