import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    // Ensure dni column exists
    await db.execute({ sql: "ALTER TABLE AccessRecord ADD COLUMN dni TEXT", args: [] }).catch(() => {});

    await db.execute({ sql: 'DELETE FROM AccessRecord', args: [] });

    const values: unknown[][] = [];
    for (const row of rows) {
      const codigoEmp = Number(row['Código de empleado']);
      if (!codigoEmp) continue;
      const nombre = String(row['Apellidos, Nombre'] || '');
      if (!nombre) continue;

      const fecha = parseExcelDate(row['Fecha']);
      const hora = parseExcelTime(row['__EMPTY'] || row['Hora'] || row['hora'] || '');
      if (!fecha) continue;

      const dni = String(row['DNI'] || '').trim();

      values.push([
        crypto.randomUUID(), codigoEmp, nombre, dni, fecha, hora,
        String(row['Terminal'] || ''), String(row['Jornada efectiva'] || ''),
        String(row['Sector'] || ''), String(row['Código de empresa'] || ''),
      ]);
    }

    if (values.length > 0) {
      await db.batch(values.map(v => ({
        sql: `INSERT INTO AccessRecord (id, codigoEmp, nombre, dni, fecha, hora, terminal, jornada, sector, empresa, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: v,
      })));
    }

    return NextResponse.json({ success: true, count: values.length });
  } catch (error) {
    console.error('Error uploading accesos:', error);
    return NextResponse.json({ error: 'Error procesando archivo de accesos' }, { status: 500 });
  }
}

function parseExcelDate(raw: unknown): string {
  if (typeof raw === 'number' && raw > 0) {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (raw instanceof Date) return raw.toISOString().split('T')[0];
  if (typeof raw === 'string' && raw.includes('-')) return raw.split('T')[0];
  return '';
}

function parseExcelTime(raw: unknown): string {
  if (typeof raw === 'number' && raw > 0) {
    const totalSeconds = Math.round(raw * 86400);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (typeof raw === 'string' && raw.includes(':')) return raw;
  if (raw instanceof Date) {
    return `${String(raw.getHours()).padStart(2, '0')}:${String(raw.getMinutes()).padStart(2, '0')}:${String(raw.getSeconds()).padStart(2, '0')}`;
  }
  return '';
}