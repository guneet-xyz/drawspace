import { createServer, type IncomingMessage } from "node:http"
import type { AddressInfo } from "node:net"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

vi.mock("server-only", () => ({}))

const requests: { req: IncomingMessage; body: string }[] = []
let status = 200
const server = createServer((req, res) => {
  let body = ""
  req.on("data", (chunk) => (body += chunk))
  req.on("end", () => {
    requests.push({ req, body })
    res.writeHead(status, { "content-type": "application/json" })
    res.end(
      status === 200
        ? JSON.stringify({ MessageId: "test-message" })
        : JSON.stringify({ message: "denied" }),
    )
  })
})

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  vi.stubEnv("AWS_ENDPOINT_URL_SESV2", `http://127.0.0.1:${port}`)
})
afterAll(() => {
  vi.unstubAllEnvs()
  server.close()
})
beforeEach(() => {
  requests.length = 0
  status = 200
  vi.stubEnv("EMAIL_FROM", "auth@example.com")
  vi.stubEnv("AWS_REGION", "us-east-1")
  vi.stubEnv("SES_CONFIGURATION_SET", "test-set")
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIATESTONLY")
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret-only")
  vi.stubEnv("AWS_EC2_METADATA_DISABLED", "true")
})

describe("SES email delivery", () => {
  it("is enabled only with a sender, region and both credentials", async () => {
    const { mailEnabled } = await import("../../src/lib/mail")
    expect(mailEnabled()).toBe(true)
    for (const name of [
      "EMAIL_FROM",
      "AWS_REGION",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
    ]) {
      const value = process.env[name]
      vi.stubEnv(name, "")
      expect(mailEnabled()).toBe(false)
      vi.stubEnv(name, value!)
    }
  })

  it("sends a signed SESv2 SendEmail request", async () => {
    const { sendEmail } = await import("../../src/lib/mail")
    await sendEmail({
      to: "person@example.com",
      subject: "Subject line",
      text: "Body text",
    })
    expect(requests).toHaveLength(1)
    const [{ req, body }] = requests
    expect(req.method).toBe("POST")
    expect(req.url).toBe("/v2/email/outbound-emails")
    expect(req.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIATESTONLY\/\d{8}\/us-east-1\/ses\/aws4_request/,
    )
    expect(JSON.stringify(req.headers)).not.toContain("test-secret-only")
    expect(JSON.parse(body)).toEqual({
      FromEmailAddress: "auth@example.com",
      Destination: { ToAddresses: ["person@example.com"] },
      ConfigurationSetName: "test-set",
      Content: {
        Simple: {
          Subject: { Data: "Subject line", Charset: "UTF-8" },
          Body: { Text: { Data: "Body text", Charset: "UTF-8" } },
        },
      },
    })
  })

  it("rejects when SES refuses the message", async () => {
    const { sendEmail } = await import("../../src/lib/mail")
    status = 403
    await expect(
      sendEmail({ to: "person@example.com", subject: "s", text: "t" }),
    ).rejects.toThrow()
  })
})
