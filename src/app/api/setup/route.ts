import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const results: Record<string, string> = {};

  try {
    await db.execute({
      sql: `CREATE TABLE IF NOT EXISTS AuxRecord (
        id TEXT PRIMARY KEY,
        dni TEXT,
        nombre TEXT,
        fecha TEXT,
        hora TEXT,
        tipo TEXT,
        detalle TEXT,
        createdAt TEXT
      )`,
      args: [],
    });
    results.AuxRecord = 'OK - tabla creada o ya existia';
  } catch (e: unknown) {
    results.AuxRecord = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Also ensure DNI column on AccessRecord
  try {
    await db.execute({ sql: "ALTER TABLE AccessRecord ADD COLUMN dni TEXT", args: [] });
    results.AccessRecord_dni = 'OK - columna dni agregada';
  } catch {
    results.AccessRecord_dni = 'OK - columna dni ya existe';
  }

  // Verify tables exist
  try {
    const r = await db.execute({ sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", args: [] });
    results.tables = r.rows.map(row => String(row.name)).join(', ');
  } catch (e: unknown) {
    results.tables_error = String(e);
  }

  return NextResponse.json(results);
}