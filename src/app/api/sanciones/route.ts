import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

async function ensureTable() {
  // Base table (original columns)
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS Sancion (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8))) || '-' || lower(hex(randomblob(4))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(12)))),
      codigoEmp INTEGER NOT NULL,
      nombre TEXT NOT NULL DEFAULT '',
      empresa TEXT NOT NULL DEFAULT '',
      sector TEXT NOT NULL DEFAULT '',
      jornada TEXT NOT NULL DEFAULT '',
      fecha TEXT NOT NULL DEFAULT '',
      salida TEXT NOT NULL DEFAULT '',
      entrada TEXT NOT NULL DEFAULT '',
      duracion TEXT NOT NULL DEFAULT '',
      duracionSegundos INTEGER NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL DEFAULT '',
      tipoLabel TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    args: [],
  });
  // Migrate: add eventos column if missing
  try {
    await db.execute({ sql: "ALTER TABLE Sancion ADD COLUMN eventos TEXT NOT NULL DEFAULT ''", args: [] });
  } catch { /* column already exists */ }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const body = await req.json();
    const { codigoEmp, fecha, salida, entrada, duracion, duracionSegundos, tipo, tipoLabel, nombre, empresa, sector, jornada, eventos } = body;

    if (!codigoEmp || !tipo) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
    }
    // For aggregated sanciones (multiple-salidas), allow empty salida/entrada/fecha
    const isAggregated = tipo === 'multiple-salidas';
    if (!isAggregated && (!fecha || !salida || !entrada)) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
    }

    let empNombre = nombre || '';
    let empEmpresa = empresa || '';
    let empSector = sector || '';
    let empJornada = jornada || '';

    // Lookup employee from DB if nombre not provided
    if (!empNombre) {
      // Try with fecha first
      if (fecha) {
        const result = await db.execute({
          sql: 'SELECT DISTINCT nombre, empresa, sector, jornada FROM AccessRecord WHERE codigoEmp = ? AND fecha = ? LIMIT 1',
          args: [String(codigoEmp), fecha],
        });
        const row = result.rows[0] as Record<string, unknown> | undefined;
        if (row) {
          empNombre = String(row.nombre ?? '');
          empEmpresa = String(row.empresa ?? '');
          empSector = String(row.sector ?? '');
          empJornada = String(row.jornada ?? '');
        }
      }
      // Fallback: search by codigoEmp only (any date)
      if (!empNombre) {
        const result2 = await db.execute({
          sql: 'SELECT DISTINCT nombre, empresa, sector, jornada FROM AccessRecord WHERE codigoEmp = ? LIMIT 1',
          args: [String(codigoEmp)],
        });
        const row2 = result2.rows[0] as Record<string, unknown> | undefined;
        if (row2) {
          empNombre = String(row2.nombre ?? '');
          empEmpresa = String(row2.empresa ?? '');
          empSector = String(row2.sector ?? '');
          empJornada = String(row2.jornada ?? '');
        }
      }
    }

    if (!empNombre) {
      return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
    }

    const tipoLabels: Record<string, string> = {
      desayuno: 'EXCESO DE DESAYUNO',
      'break-tarde': 'EXCESO BREAK TARDE',
      'break-noche': 'EXCESO BREAK NOCHE',
      'multiple-salidas': 'MAYOR CANTIDAD DE SALIDAS',
    };
    const resolvedTipoLabel = tipoLabel || tipoLabels[tipo] || tipo.toUpperCase();
    const eventosJson = eventos ? JSON.stringify(eventos) : '';

    await db.execute({
      sql: `INSERT INTO Sancion (codigoEmp, nombre, empresa, sector, jornada, fecha, salida, entrada, duracion, duracionSegundos, tipo, tipoLabel, eventos)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [codigoEmp, empNombre, empEmpresa, empSector, empJornada, fecha || '', salida || '', entrada || '', duracion || '', duracionSegundos || 0, tipo, resolvedTipoLabel, eventosJson],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating sancion:', error);
    return NextResponse.json({ error: 'Error creando sancion', detail: String(error) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const codigoEmp = searchParams.get('codigoEmp');
    const tipo = searchParams.get('tipo');

    let where = '';
    const args: (string | number)[] = [];
    if (codigoEmp) { where = 'WHERE codigoEmp = ?'; args.push(Number(codigoEmp)); }
    if (tipo) { where = where ? `${where} AND tipo = ?` : 'WHERE tipo = ?'; args.push(tipo); }

    const result = await db.execute({
      sql: `SELECT * FROM Sancion ${where} ORDER BY createdAt DESC`,
      args,
    });

    const sanciones = result.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ''),
      codigoEmp: Number(r.codigoEmp ?? 0),
      nombre: String(r.nombre ?? ''),
      empresa: String(r.empresa ?? ''),
      sector: String(r.sector ?? ''),
      jornada: String(r.jornada ?? ''),
      fecha: String(r.fecha ?? ''),
      salida: String(r.salida ?? ''),
      entrada: String(r.entrada ?? ''),
      duracion: String(r.duracion ?? ''),
      duracionSegundos: Number(r.duracionSegundos ?? 0),
      tipo: String(r.tipo ?? ''),
      tipoLabel: String(r.tipoLabel ?? ''),
      eventos: String(r.eventos ?? ''),
      createdAt: String(r.createdAt ?? ''),
    }));

    const statsResult = await db.execute({
      sql: `SELECT codigoEmp, nombre, empresa, COUNT(*) as totalSanciones, MAX(createdAt) as ultimaSancion
            FROM Sancion GROUP BY codigoEmp ORDER BY totalSanciones DESC, ultimaSancion DESC`,
      args: [],
    });

    const stats = statsResult.rows.map((r: Record<string, unknown>) => ({
      codigoEmp: Number(r.codigoEmp ?? 0),
      nombre: String(r.nombre ?? ''),
      empresa: String(r.empresa ?? ''),
      totalSanciones: Number(r.totalSanciones ?? 0),
      ultimaSancion: String(r.ultimaSancion ?? ''),
    }));

    return NextResponse.json({ sanciones, stats });
  } catch (error) {
    console.error('Error fetching sanciones:', error);
    return NextResponse.json({ error: 'Error obteniendo sanciones', detail: String(error) }, { status: 500 });
  }
}