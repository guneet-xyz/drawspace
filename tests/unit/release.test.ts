import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")

describe("release image", () => {
  it("defaults compose.release.yaml to the v-prefixed package version", () => {
    const { version } = JSON.parse(read("package.json")) as { version: string }
    const image = read("compose.release.yaml")
      .split("\n")
      .find((line) => line.includes("x-release-please-version"))
    expect(image).toContain(
      `\${DRAWSPACE_IMAGE:-cr.guneet.dev/drawspace/drawspace:v${version}}`,
    )
  })
})
