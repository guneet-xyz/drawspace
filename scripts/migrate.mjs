import postgres from 'postgres'
import { readdir, readFile } from 'node:fs/promises'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(71928401)`
    await tx`CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
    const applied = await tx`SELECT name FROM migrations`
    for (const name of (await readdir('migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      if (applied.some((row) => row.name === name)) continue
      await tx.unsafe(await readFile(`migrations/${name}`, 'utf8'))
      await tx`INSERT INTO migrations (name) VALUES (${name})`
      console.log(`Applied ${name}`)
    }
  })
} finally {
  await sql.end()
}
