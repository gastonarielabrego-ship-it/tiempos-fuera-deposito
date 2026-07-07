import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

async function ensureTable() {
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS ExttIndicador (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8))) || '-' || lower(hex(randomblob(4))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(12)))),
      fecha TEXT NOT NULL,
      totalEmpleados INTEGER NOT NULL DEFAULT 0,
      totalRegistros INTEGER NOT NULL DEFAULT 0,
      totalSalidas INTEGER NOT NULL DEFAULT 0,
      totalFueraSegundos INTEGER NOT NULL DEFAULT 0,
      tmEmpleados INTEGER NOT NULL DEFAULT 0,
      tmRegistros INTEGER NOT NULL DEFAULT 0,
      tmSalidas INTEGER NOT NULL DEFAULT 0,
      tmFueraSegundos INTEGER NOT NULL DEFAULT 0,
      ttEmpleados INTEGER NOT NULL DEFAULT 0,
      ttRegistros INTEGER NOT NULL DEFAULT 0,
      ttSalidas INTEGER NOT NULL DEFAULT 0,
      ttFueraSegundos INTEGER NOT NULL DEFAULT 0,
      tnEmpleados INTEGER NOT NULL DEFAULT 0,
      tnRegistros INTEGER NOT NULL DEFAULT 0,
      tnSalidas INTEGER NOT NULL DEFAULT 0,
      tnFueraSegundos INTEGER NOT NULL DEFAULT 0,
      sancionados INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    args: [],
  });
  // Unique constraint on fecha to prevent duplicates per day
  try {
    await db.execute({ sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_extt_fecha ON ExttIndicador(fecha)', args: [] });
  } catch { /* already exists */ }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const body = await req.json();
    const { fecha, totalEmpleados, totalRegistros, totalSalidas, totalFueraSegundos, tmEmpleados, tmRegistros, tmSalidas, tmFueraSegundos, ttEmpleados, ttRegistros, ttSalidas, ttFueraSegundos, tnEmpleados, tnRegistros, tnSalidas, tnFueraSegundos, sancionados } = body;

    if (!fecha) {
      return NextResponse.json({ error: 'fecha requerida' }, { status: 400 });
    }

    // Upsert: insert or replace if same fecha
    await db.execute({
      sql: `INSERT INTO ExttIndicador (fecha, totalEmpleados, totalRegistros, totalSalidas, totalFueraSegundos, tmEmpleados, tmRegistros, tmSalidas, tmFueraSegundos, ttEmpleados, ttRegistros, ttSalidas, ttFueraSegundos, tnEmpleados, tnRegistros, tnSalidas, tnFueraSegundos, sancionados)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(fecha) DO UPDATE SET
              totalEmpleados=excluded.totalEmpleados, totalRegistros=excluded.totalRegistros, totalSalidas=excluded.totalSalidas, totalFueraSegundos=excluded.totalFueraSegundos,
              tmEmpleados=excluded.tmEmpleados, tmRegistros=excluded.tmRegistros, tmSalidas=excluded.tmSalidas, tmFueraSegundos=excluded.tmFueraSegundos,
              ttEmpleados=excluded.ttEmpleados, ttRegistros=excluded.ttRegistros, ttSalidas=excluded.ttSalidas, ttFueraSegundos=excluded.ttFueraSegundos,
              tnEmpleados=excluded.tnEmpleados, tnRegistros=excluded.tnRegistros, tnSalidas=excluded.tnSalidas, tnFueraSegundos=excluded.tnFueraSegundos,
              sancionados=excluded.sancionados, createdAt=datetime('now')`,
      args: [
        fecha, totalEmpleados || 0, totalRegistros || 0, totalSalidas || 0, totalFueraSegundos || 0,
        tmEmpleados || 0, tmRegistros || 0, tmSalidas || 0, tmFueraSegundos || 0,
        ttEmpleados || 0, ttRegistros || 0, ttSalidas || 0, ttFueraSegundos || 0,
        tnEmpleados || 0, tnRegistros || 0, tnSalidas || 0, tnFueraSegundos || 0,
        sancionados || 0,
      ],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving extt indicador:', error);
    return NextResponse.json({ error: 'Error guardando indicador' }, { status: 500 });
  }
}

export async function GET() {
  try {
    await ensureTable();
    const result = await db.execute({
      sql: 'SELECT * FROM ExttIndicador ORDER BY fecha DESC',
      args: [],
    });

    const indicadores = result.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ''),
      fecha: String(r.fecha ?? ''),
      totalEmpleados: Number(r.totalEmpleados ?? 0),
      totalRegistros: Number(r.totalRegistros ?? 0),
      totalSalidas: Number(r.totalSalidas ?? 0),
      totalFueraSegundos: Number(r.totalFueraSegundos ?? 0),
      tmEmpleados: Number(r.tmEmpleados ?? 0),
      tmRegistros: Number(r.tmRegistros ?? 0),
      tmSalidas: Number(r.tmSalidas ?? 0),
      tmFueraSegundos: Number(r.tmFueraSegundos ?? 0),
      ttEmpleados: Number(r.ttEmpleados ?? 0),
      ttRegistros: Number(r.ttRegistros ?? 0),
      ttSalidas: Number(r.ttSalidas ?? 0),
      ttFueraSegundos: Number(r.ttFueraSegundos ?? 0),
      tnEmpleados: Number(r.tnEmpleados ?? 0),
      tnRegistros: Number(r.tnRegistros ?? 0),
      tnSalidas: Number(r.tnSalidas ?? 0),
      tnFueraSegundos: Number(r.tnFueraSegundos ?? 0),
      sancionados: Number(r.sancionados ?? 0),
      createdAt: String(r.createdAt ?? ''),
    }));

    return NextResponse.json(indicadores);
  } catch (error) {
    console.error('Error fetching extt indicadores:', error);
    return NextResponse.json({ error: 'Error obteniendo indicadores' }, { status: 500 });
  }
}