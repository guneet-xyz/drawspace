import { NextRequest, NextResponse } from "next/server"

import { createSession } from "@/lib/auth"
import { appOrigin, DiscordError } from "@/lib/discord"
import { confirmDiscordEmailLink } from "@/lib/discord-email-link"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const redirect = (path: string) => {
  const response = NextResponse.redirect(new URL(path, appOrigin()), 303)
  response.headers.set("Cache-Control", "no-store")
  return response
}

export async function POST(req: NextRequest) {
  // Email links only render a page; consuming the token needs a same-origin
  // form submission, so link scanners and cross-site posts can't use it.
  if (req.headers.get("origin") !== appOrigin())
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 },
    )
  if (
    !req.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded") ||
    Number(req.headers.get("content-length")) > 4096
  )
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  try {
    const body = await req.text()
    if (body.length > 4096) throw new DiscordError("link_expired")
    const form = new URLSearchParams(body)
    const user = await confirmDiscordEmailLink(
      form.get("token") ?? "",
      form.get("disablePassword") === "on",
    )
    await createSession(user.id)
    return redirect("/app/settings?discord_connected=true")
  } catch (error) {
    const code = error instanceof DiscordError ? error.code : "failed"
    return redirect(`/login?discord_error=${code}`)
  }
}
