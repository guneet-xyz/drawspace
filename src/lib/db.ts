import 'server-only'
import postgres from 'postgres'

const globalForSql = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>
}
export const sql =
  globalForSql.sql ??
  postgres(
    process.env.DATABASE_URL ||
      'postgres://drawspace:drawspace@localhost:5432/drawspace',
    {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    },
  )
if (process.env.NODE_ENV !== 'production') globalForSql.sql = sql
