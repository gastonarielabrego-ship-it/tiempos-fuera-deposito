import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

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

    // Delete all existing records (data gets overwritten)
    await db.accessRecord.deleteMany({});

    const records = [];
    for (const row of rows) {
      // Skip header row
      const codigoEmp = Number(row['Código de empleado']);
      if (!codigoEmp || codigoEmp === 0) continue;

      const nombre = String(row['Apellidos, Nombre'] || '');
      if (!nombre) continue;

      // Parse fecha - could be Excel serial number or date string
      const fechaRaw = row['Fecha'];
      let fecha = '';
      if (typeof fechaRaw === 'number' && fechaRaw > 0) {
        const d = XLSX.SSF.parse_date_code(fechaRaw);
        if (d) {
          fecha = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }
      } else if (fechaRaw instanceof Date) {
        fecha = fechaRaw.toISOString().split('T')[0];
      } else if (typeof fechaRaw === 'string' && fechaRaw.includes('-')) {
        fecha = fechaRaw.split('T')[0];
      }

      // Parse hora - the column header is empty, XLSX names it __EMPTY
      const horaRaw = row['__EMPTY'] || row['Hora'] || row['hora'] || '';
      let hora = '';
      if (typeof horaRaw === 'number' && horaRaw > 0) {
        const totalSeconds = Math.round(horaRaw * 86400);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        hora = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      } else if (typeof horaRaw === 'string' && horaRaw.includes(':')) {
        hora = horaRaw;
      } else if (horaRaw instanceof Date) {
        const d = horaRaw as Date;
        hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      }

      if (!fecha) continue;

      records.push({
        codigoEmp,
        nombre,
        fecha,
        hora,
        terminal: String(row['Terminal'] || ''),
        jornada: String(row['Jornada efectiva'] || ''),
        sector: String(row['Sector'] || ''),
        empresa: String(row['Código de empresa'] || ''),
      });
    }

    // Insert in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await db.accessRecord.createMany({ data: batch });
    }

    return NextResponse.json({ success: true, count: records.length });
  } catch (error) {
    console.error('Error uploading accesos:', error);
    return NextResponse.json({ error: 'Error procesando archivo de accesos' }, { status: 500 });
  }
}