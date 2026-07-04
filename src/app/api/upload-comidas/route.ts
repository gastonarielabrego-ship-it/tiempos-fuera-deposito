import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

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

function getRowValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k];
    // Try with trailing space
    if (row[k + ' '] !== undefined && row[k + ' '] !== '') return row[k + ' '];
  }
  return '';
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    await db.mealRecord.deleteMany({});

    const records = [];
    for (const row of rows) {
      const nombre = String(getRowValue(row, 'Nombre') || '');
      const dni = Number(getRowValue(row, 'DNI') || 0);
      if (!nombre || !dni) continue;

      const fecha = parseExcelDate(getRowValue(row, 'Fecha'));
      const hora = parseExcelTime(getRowValue(row, 'y', 'Hora', 'hora'));
      if (!fecha || !hora) continue;

      records.push({ nombre, dni, fecha, hora });
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      await db.mealRecord.createMany({ data: records.slice(i, i + BATCH_SIZE) });
    }

    return NextResponse.json({ success: true, count: records.length });
  } catch (error) {
    console.error('Error uploading comidas:', error);
    return NextResponse.json({ error: 'Error procesando archivo de comidas' }, { status: 500 });
  }
}