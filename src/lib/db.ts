/**
 * Database client — PostgreSQL on Neon (Lakebase Postgres)
 *
 * Drop-in replacement for the previous @libsql/client wrapper.
 * Exposes the same `db.execute({ sql, args })` / `db.batch([...])` interface,
 * so API routes keep working unchanged. Internally it:
 *
 *  1. Uses the Neon serverless HTTP driver (@neondatabase/serverless).
 *  2. Translates SQLite-isms in the SQL to PostgreSQL equivalents:
 *     - `?` placeholders            -> `$1, $2, ...`
 *     - `datetime('now')`           -> `to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`
 *     - SQLite randomblob UUID DDL  -> `gen_random_uuid()::text`
 *     - sqlite_master table listing -> pg_tables
 *  3. Restores camelCase keys on result rows (Postgres folds unquoted
 *     identifiers to lowercase; the app expects `codigoEmp`, etc.).
 *  4. `db.batch()` rewrites runs of identical INSERT statements into
 *     chunked multi-row inserts (single HTTP round-trip per chunk).
 */
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

const globalForDb = globalThis as unknown as {
  __neonSql: NeonQueryFunction<false, false> | undefined;
};

function getSql(): NeonQueryFunction<false, false> {
  if (globalForDb.__neonSql) return globalForDb.__neonSql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no está configurada');
  const sql = neon(url);
  globalForDb.__neonSql = sql;
  return sql;
}

/* ─────────────────────────── SQL translation ─────────────────────────── */

/** SQLite randomblob-based UUID default -> Postgres native uuid. */
const SQLITE_UUID_DEFAULT =
  /DEFAULT\s*\(\s*lower\(hex\(randomblob\(8\)\)\)[\s\S]*?lower\(hex\(randomblob\(12\)\)\)\s*\)/gi;

/** SQLite table listing -> Postgres equivalent (same output shape: `name`). */
const SQLITE_MASTER_QUERY =
  /SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+ORDER\s+BY\s+name/i;

const PG_NOW_TEXT = `to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`;

function translateSqlText(sql: string): string {
  let out = sql;
  if (SQLITE_MASTER_QUERY.test(out)) {
    out = "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename";
  }
  out = out.replace(SQLITE_UUID_DEFAULT, 'DEFAULT gen_random_uuid()::text');
  // datetime('now') in DEFAULT clauses, VALUES tuples and SET expressions
  out = out.replace(/\bdatetime\('now'\)/gi, PG_NOW_TEXT);
  return out;
}

/** Convert `?` placeholders to `$N`, skipping single-quoted string literals. */
function convertPlaceholders(sql: string): { sql: string; paramCount: number } {
  let out = '';
  let n = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      if (ch === "'") {
        if (sql[i + 1] === "'") { out += "''"; i++; continue; } // escaped quote
        inString = false;
      }
      out += ch;
      continue;
    }
    if (ch === "'") { inString = true; out += ch; continue; }
    if (ch === '?') { n++; out += `$${n}`; continue; }
    out += ch;
  }
  return { sql: out, paramCount: n };
}

interface PreparedQuery { sql: string; args: unknown[] }

function prepare(sqlText: string, args: unknown[]): PreparedQuery {
  const translated = translateSqlText(sqlText);
  const { sql, paramCount } = convertPlaceholders(translated);
  if (paramCount !== args.length) {
    throw new Error(
      `Consulta requiere ${paramCount} parámetros pero se recibieron ${args.length}: ${sql.slice(0, 120)}`
    );
  }
  return { sql, args };
}

/* ─────────────────────── camelCase key restoration ───────────────────── */

const CAMEL_CASE_KEYS = [
  'codigoEmp', 'duracionSegundos', 'tipoLabel', 'createdAt',
  // IndicadorDiario / ExttIndicador columns
  'totalOperadores', 'totalConIncidencia', 'totalRegistros', 'totalSalidas',
  'totalFueraSegundos', 'promedioFueraSegundos', 'totalEmpleados',
  'tmOperadores', 'tmConIncidencia', 'tmRegistros', 'tmSalidas', 'tmFueraSegundos',
  'ttOperadores', 'ttConIncidencia', 'ttRegistros', 'ttSalidas', 'ttFueraSegundos',
  'tnOperadores', 'tnConIncidencia', 'tnRegistros', 'tnSalidas', 'tnFueraSegundos',
  // query aliases
  'totalSanciones', 'ultimaSancion',
];

const KEY_MAP = new Map(CAMEL_CASE_KEYS.map((k) => [k.toLowerCase(), k]));

function restoreRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const mapped = KEY_MAP.get(key);
    out[mapped ?? key] = row[key];
  }
  return out;
}

/* ───────────────────────── multi-row INSERT batching ─────────────────── */

/** Max rows per multi-row INSERT (keeps params well under PG's 65535 limit). */
const MAX_ROWS_PER_INSERT = 500;

/**
 * Split a parenthesized, quoted SQL fragment on top-level commas.
 * Returns null if the fragment is unbalanced.
 */
function splitTopLevel(fragment: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let current = '';
  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i];
    if (inString) {
      current += ch;
      if (ch === "'") {
        if (fragment[i + 1] === "'") { current += "'"; i++; continue; }
        inString = false;
      }
      continue;
    }
    if (ch === "'") { inString = true; current += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (depth !== 0 || inString) return null;
  parts.push(current.trim());
  return parts;
}

const INSERT_VALUES_RE = /^(INSERT\s+INTO\s+[\w."]+\s*\([^)]*\)\s*VALUES\s*)(\([\s\S]*\))\s*$/i;

/**
 * Rewrite N identical `INSERT ... VALUES (...)` statements into chunked
 * multi-row INSERT statements. Returns null when the shape isn't supported.
 */
function planMultiRowInsert(sqlText: string, argSets: unknown[][]): PreparedQuery[] | null {
  const m = sqlText.match(INSERT_VALUES_RE);
  if (!m) return null;
  const prefix = m[1];
  const inner = m[2].slice(1, -1);
  const segments = splitTopLevel(inner);
  if (!segments) return null;
  const perRowParams = segments.filter((s) => /^\$\d+$/.test(s)).length;
  if (perRowParams !== argSets[0].length) return null;

  const queries: PreparedQuery[] = [];
  for (let start = 0; start < argSets.length; start += MAX_ROWS_PER_INSERT) {
    const chunk = argSets.slice(start, start + MAX_ROWS_PER_INSERT);
    const rows: string[] = [];
    const args: unknown[] = [];
    let paramIndex = 0; // numeración global de $N dentro del chunk
    for (const argSet of chunk) {
      let rowArgIdx = 0; // índice dentro de los args de ESTA fila
      const built = segments.map((seg) => {
        if (/^\$\d+$/.test(seg)) {
          paramIndex++;
          args.push(argSet[rowArgIdx++]);
          return `$${paramIndex}`;
        }
        return seg;
      });
      rows.push(`(${built.join(', ')})`);
    }
    queries.push({ sql: `${prefix}${rows.join(', ')}`, args });
  }
  return queries;
}

/* ─────────────────────────── public interface ────────────────────────── */

export interface ExecResult {
  rows: Record<string, unknown>[];
  rowsAffected: number;
  columns: string[];
}

export interface BatchStatement { sql: string; args: unknown[] }

export const db = {
  async execute(stmt: BatchStatement): Promise<ExecResult> {
    const { sql, args } = prepare(stmt.sql, stmt.args ?? []);
    const sqlFn = getSql();
    const rows = (await sqlFn.query(sql, args as unknown[])) as Record<string, unknown>[];
    return {
      rows: rows.map(restoreRowKeys),
      rowsAffected: (rows as unknown as { rowCount?: number }).rowCount ?? rows.length,
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    };
  },

  async batch(statements: BatchStatement[]): Promise<ExecResult[]> {
    const sqlFn = getSql();
    const results: ExecResult[] = [];

    // Group consecutive statements sharing identical SQL text
    const groups: { sql: string; argSets: unknown[][] }[] = [];
    for (const s of statements) {
      const last = groups[groups.length - 1];
      if (last && last.sql === s.sql) last.argSets.push(s.args ?? []);
      else groups.push({ sql: s.sql, argSets: [s.args ?? []] });
    }

    for (const g of groups) {
      if (g.argSets.length === 1) {
        results.push(await this.execute({ sql: g.sql, args: g.argSets[0] }));
        continue;
      }
      // Bulk-INSERT fast path: chunked multi-row statements
      const plan = planMultiRowInsert(prepare(g.sql, g.argSets[0]).sql, g.argSets);
      if (plan) {
        for (const q of plan) {
          const rows = (await sqlFn.query(q.sql, q.args as unknown[])) as Record<string, unknown>[];
          results.push({ rows: rows.map(restoreRowKeys), rowsAffected: rows.length, columns: [] });
        }
      } else {
        // Fallback: run one-by-one
        for (const argSet of g.argSets) {
          results.push(await this.execute({ sql: g.sql, args: argSet }));
        }
      }
    }
    return results;
  },
};

export default db;
