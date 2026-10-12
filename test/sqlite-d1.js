// Real SQLite execution keeps delivery concurrency and migration tests independent of SQL mocks.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

export class SqliteD1 {
  constructor() {
    this.raw = new DatabaseSync(':memory:')
    this.raw.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  }
  prepare(sql) {
    const db = this.raw
    const statement = (values = []) => ({
      bind: (...args) => statement(args),
      async all() { return { results: db.prepare(sql).all(...values), success: true } },
      async first(column) { const row = db.prepare(sql).get(...values); return column && row ? row[column] : row || null },
      async run() { const r = db.prepare(sql).run(...values); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } } },
    })
    return statement()
  }
  async batch(statements) {
    this.raw.exec('BEGIN')
    try { const rows = []; for (const statement of statements) rows.push(await statement.run()); this.raw.exec('COMMIT'); return rows }
    catch (error) { this.raw.exec('ROLLBACK'); throw error }
  }
  close() { this.raw.close() }
}
