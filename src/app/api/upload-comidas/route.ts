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

    await db.execute({ sql: 'DELETE FROM MealRecord', args: [] });

    const values: unknown[][] = [];
    for (const row of rows) {
      const nombre = String(getRowValue(row, 'Nombre') || '');
      const dni = Number(getRowValue(row, 'DNI') || 0);
      if (!nombre || !dni) continue;
      const fecha = parseExcelDate(getRowValue(row, 'Fecha'));
      const hora = parseExcelTime(getRowValue(row, 'y', 'Hora', 'hora'));
      if (!fecha || !hora) continue;
      values.push([crypto.randomUUID(), nombre, dni, fecha, hora]);
    }

    if (values.length > 0) {
      await db.batch(values.map(v => ({
        sql: `INSERT INTO MealRecord (id, nombre, dni, fecha, hora, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        args: v,
      })));
    }

    return NextResponse.json({ success: true, count: values.length });
  } catch (error) {
    console.error('Error uploading comidas:', error);
    return NextResponse.json({ error: 'Error procesando archivo de comidas' }, { status: 500 });
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
    const t = Math.round(raw * 86400);
    return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  if (typeof raw === 'string' && raw.includes(':')) return raw;
  if (raw instanceof Date) return `${String(raw.getHours()).padStart(2, '0')}:${String(raw.getMinutes()).padStart(2, '0')}:${String(raw.getSeconds()).padStart(2, '0')}`;
  return '';
}

function getRowValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k];
    if (row[k + ' '] !== undefined && row[k + ' '] !== '') return row[k + ' '];
  }
  return '';
}