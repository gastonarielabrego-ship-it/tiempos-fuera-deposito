import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

async function ensureTable() {
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS IndicadorDiario (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8))) || '-' || lower(hex(randomblob(4))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2)),2)) || '-' || lower(hex(randomblob(12)))),
      fecha TEXT NOT NULL,
      totalOperadores INTEGER NOT NULL DEFAULT 0,
      totalConIncidencia INTEGER NOT NULL DEFAULT 0,
      totalRegistros INTEGER NOT NULL DEFAULT 0,
      totalSalidas INTEGER NOT NULL DEFAULT 0,
      totalFueraSegundos INTEGER NOT NULL DEFAULT 0,
      promedioFueraSegundos INTEGER NOT NULL DEFAULT 0,
      tmOperadores INTEGER NOT NULL DEFAULT 0,
      tmConIncidencia INTEGER NOT NULL DEFAULT 0,
      tmSalidas INTEGER NOT NULL DEFAULT 0,
      tmFueraSegundos INTEGER NOT NULL DEFAULT 0,
      ttOperadores INTEGER NOT NULL DEFAULT 0,
      ttConIncidencia INTEGER NOT NULL DEFAULT 0,
      ttSalidas INTEGER NOT NULL DEFAULT 0,
      ttFueraSegundos INTEGER NOT NULL DEFAULT 0,
      tnOperadores INTEGER NOT NULL DEFAULT 0,
      tnConIncidencia INTEGER NOT NULL DEFAULT 0,
      tnSalidas INTEGER NOT NULL DEFAULT 0,
      tnFueraSegundos INTEGER NOT NULL DEFAULT 0,
      sancionados INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    args: [],
  });
  try {
    await db.execute({ sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_indicador_fecha ON IndicadorDiario(fecha)', args: [] });
  } catch { /* exists */ }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const b = await req.json();
    const {
      fecha, totalOperadores, totalConIncidencia, totalRegistros, totalSalidas,
      totalFueraSegundos, promedioFueraSegundos,
      tmOperadores, tmConIncidencia, tmSalidas, tmFueraSegundos,
      ttOperadores, ttConIncidencia, ttSalidas, ttFueraSegundos,
      tnOperadores, tnConIncidencia, tnSalidas, tnFueraSegundos,
      sancionados,
    } = b;

    if (!fecha) return NextResponse.json({ error: 'fecha requerida' }, { status: 400 });

    await db.execute({
      sql: `INSERT INTO IndicadorDiario (fecha, totalOperadores, totalConIncidencia, totalRegistros, totalSalidas, totalFueraSegundos, promedioFueraSegundos,
            tmOperadores, tmConIncidencia, tmSalidas, tmFueraSegundos,
            ttOperadores, ttConIncidencia, ttSalidas, ttFueraSegundos,
            tnOperadores, tnConIncidencia, tnSalidas, tnFueraSegundos, sancionados)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(fecha) DO UPDATE SET
              totalOperadores=excluded.totalOperadores, totalConIncidencia=excluded.totalConIncidencia,
              totalRegistros=excluded.totalRegistros, totalSalidas=excluded.totalSalidas,
              totalFueraSegundos=excluded.totalFueraSegundos, promedioFueraSegundos=excluded.promedioFueraSegundos,
              tmOperadores=excluded.tmOperadores, tmConIncidencia=excluded.tmConIncidencia,
              tmSalidas=excluded.tmSalidas, tmFueraSegundos=excluded.tmFueraSegundos,
              ttOperadores=excluded.ttOperadores, ttConIncidencia=excluded.ttConIncidencia,
              ttSalidas=excluded.ttSalidas, ttFueraSegundos=excluded.ttFueraSegundos,
              tnOperadores=excluded.tnOperadores, tnConIncidencia=excluded.tnConIncidencia,
              tnSalidas=excluded.tnSalidas, tnFueraSegundos=excluded.tnFueraSegundos,
              sancionados=excluded.sancionados, createdAt=datetime('now')`,
      args: [
        fecha,
        totalOperadores || 0, totalConIncidencia || 0, totalRegistros || 0, totalSalidas || 0,
        totalFueraSegundos || 0, promedioFueraSegundos || 0,
        tmOperadores || 0, tmConIncidencia || 0, tmSalidas || 0, tmFueraSegundos || 0,
        ttOperadores || 0, ttConIncidencia || 0, ttSalidas || 0, ttFueraSegundos || 0,
        tnOperadores || 0, tnConIncidencia || 0, tnSalidas || 0, tnFueraSegundos || 0,
        sancionados || 0,
      ],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving indicador:', error);
    return NextResponse.json({ error: 'Error guardando indicador' }, { status: 500 });
  }
}

export async function GET() {
  try {
    await ensureTable();
    const result = await db.execute({ sql: 'SELECT * FROM IndicadorDiario ORDER BY fecha DESC', args: [] });

    const indicadores = result.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ''),
      fecha: String(r.fecha ?? ''),
      totalOperadores: Number(r.totalOperadores ?? 0),
      totalConIncidencia: Number(r.totalConIncidencia ?? 0),
      totalRegistros: Number(r.totalRegistros ?? 0),
      totalSalidas: Number(r.totalSalidas ?? 0),
      totalFueraSegundos: Number(r.totalFueraSegundos ?? 0),
      promedioFueraSegundos: Number(r.promedioFueraSegundos ?? 0),
      tmOperadores: Number(r.tmOperadores ?? 0),
      tmConIncidencia: Number(r.tmConIncidencia ?? 0),
      tmSalidas: Number(r.tmSalidas ?? 0),
      tmFueraSegundos: Number(r.tmFueraSegundos ?? 0),
      ttOperadores: Number(r.ttOperadores ?? 0),
      ttConIncidencia: Number(r.ttConIncidencia ?? 0),
      ttSalidas: Number(r.ttSalidas ?? 0),
      ttFueraSegundos: Number(r.ttFueraSegundos ?? 0),
      tnOperadores: Number(r.tnOperadores ?? 0),
      tnConIncidencia: Number(r.tnConIncidencia ?? 0),
      tnSalidas: Number(r.tnSalidas ?? 0),
      tnFueraSegundos: Number(r.tnFueraSegundos ?? 0),
      sancionados: Number(r.sancionados ?? 0),
      createdAt: String(r.createdAt ?? ''),
    }));

    return NextResponse.json(indicadores);
  } catch (error) {
    console.error('Error fetching indicadores:', error);
    return NextResponse.json({ error: 'Error obteniendo indicadores' }, { status: 500 });
  }
}