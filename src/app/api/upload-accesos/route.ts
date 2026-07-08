import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

/**
 * Flexible column finder: tries exact match first, then case-insensitive,
 * then substring/contains match. Returns the actual key from the row or undefined.
 */
function findCol(row: Record<string, unknown>, candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  // 1. Exact match
  for (const c of candidates) {
    if (keys.includes(c)) return c;
  }
  // 2. Case-insensitive match (normalized: lowercase, trim, collapse spaces)
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  const normMap = new Map<string, string>();
  for (const k of keys) normMap.set(norm(k), k);
  for (const c of candidates) {
    const nk = norm(c);
    if (normMap.has(nk)) return normMap.get(nk);
  }
  // 3. Contains / partial match
  for (const c of candidates) {
    const nc = norm(c);
    for (const [nk, orig] of normMap) {
      if (nk.includes(nc) || nc.includes(nk)) return orig;
    }
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    if (rows.length === 0) {
      return NextResponse.json({ success: true, count: 0, debug: { message: 'Archivo vacío o sin filas de datos' } });
    }

    // Discover actual column names from the first row
    const actualColumns = Object.keys(rows[0]);
    console.log('[upload-accesos] Columnas encontradas:', actualColumns);

    // Ensure dni column exists
    await db.execute({ sql: "ALTER TABLE AccessRecord ADD COLUMN dni TEXT", args: [] }).catch(() => {});

    await db.execute({ sql: 'DELETE FROM AccessRecord', args: [] });

    // Flexible column mapping
    const colCodigo = findCol(rows[0], ['Código de empleado', 'Codigo de empleado', 'Código empleado', 'Codigo empleado', 'codigo_empleado', 'codigo', 'Código', 'Codigo', 'Cod.Empleado', 'Cod_Empleado', 'Legajo', 'lega', 'Nro.Empleado']);
    const colNombre = findCol(rows[0], ['Apellidos, Nombre', 'Apellidos y Nombre', 'Apellido, Nombre', 'Apellido y Nombre', 'Apellidos', 'Nombre', 'nombre', 'Apellido Nombre', 'Nombre Completo', 'Empleado', 'Nombre completo']);
    const colFecha = findCol(rows[0], ['Fecha', 'fecha', 'FECHA', 'Date', 'date', 'Fec.', 'Fec']);
    const colHora = findCol(rows[0], ['Hora', 'hora', 'HORA', 'Time', 'time', 'Horario', '__EMPTY', 'Reloj']);
    const colDNI = findCol(rows[0], ['DNI', 'Dni', 'dni', 'D.N.I.', 'Nro.Documento', 'Documento', 'Nro Doc', 'Nº Doc', 'N° Doc']);
    const colTerminal = findCol(rows[0], ['Terminal', 'terminal', 'TERMINAL', 'FICHERO', 'Fichero', 'fichero', 'Tipo', 'Evento', 'Descripción', 'Descripcion', 'Sentido', 'Movimiento', 'Sentido de paso']);
    const colJornada = findCol(rows[0], ['Jornada efectiva', 'Jornada Efectiva', 'Jornada', 'jornada', 'Turno', 'turno', 'TURNO', 'Jornada efect.']);
    const colSector = findCol(rows[0], ['Sector', 'sector', 'SECTOR', 'Sección', 'Seccion', 'Area', 'Área', 'Departamento']);
    const colEmpresa = findCol(rows[0], ['Código de empresa', 'Codigo de empresa', 'Empresa', 'empresa', 'EMPRESA', 'Cod. Empresa', 'Cod Empresa', 'Razon Social', 'Razón Social']);

    console.log('[upload-accesos] Columnas mapeadas:', {
      codigo: colCodigo, nombre: colNombre, fecha: colFecha, hora: colHora,
      dni: colDNI, terminal: colTerminal, jornada: colJornada, sector: colSector, empresa: colEmpresa,
    });

    // If critical columns not found, return debug info
    if (!colCodigo || !colNombre) {
      return NextResponse.json({
        success: false,
        count: 0,
        debug: {
          message: 'No se encontraron columnas de Código de empleado o Nombre',
          columns: actualColumns,
          mapped: { codigo: colCodigo, nombre: colNombre, fecha: colFecha, hora: colHora },
        },
      });
    }

    let skippedCodigo = 0;
    let skippedNombre = 0;
    let skippedFecha = 0;

    const values: (string | number)[][] = [];
    for (const row of rows) {
      const codigoEmp = Number(row[colCodigo]);
      if (!codigoEmp) { skippedCodigo++; continue; }

      const nombre = String(row[colNombre] || '').trim();
      if (!nombre) { skippedNombre++; continue; }

      const rawFecha = colFecha ? row[colFecha] : undefined;
      const fecha = parseExcelDate(rawFecha);
      if (!fecha) { skippedFecha++; continue; }

      const rawHora = colHora ? (row[colHora] || '') : '';
      const hora = parseExcelTime(rawHora);

      const dni = colDNI ? String(row[colDNI] || '').trim() : '';
      const terminal = colTerminal ? String(row[colTerminal] || '').trim() : '';
      const jornada = colJornada ? String(row[colJornada] || '').trim() : '';
      const sector = colSector ? String(row[colSector] || '').trim() : '';
      const empresa = colEmpresa ? String(row[colEmpresa] || '').trim() : '';

      values.push([
        crypto.randomUUID(), codigoEmp, nombre, dni, fecha, hora,
        terminal, jornada, sector, empresa,
      ]);
    }

    if (values.length > 0) {
      await db.batch(values.map(v => ({
        sql: `INSERT INTO AccessRecord (id, codigoEmp, nombre, dni, fecha, hora, terminal, jornada, sector, empresa, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: v,
      })));
    }

    console.log(`[upload-accesos] Procesadas ${values.length} filas de ${rows.length} totales (skipped: codigo=${skippedCodigo}, nombre=${skippedNombre}, fecha=${skippedFecha})`);

    // Check how many records have non-empty terminal
    const withTerminal = values.filter(v => v[6] && String(v[6]).length > 0).length;

    const resp: Record<string, unknown> = {
      success: true, count: values.length, total: rows.length,
      mapping: {
        columns: actualColumns,
        codigo: colCodigo, nombre: colNombre, fecha: colFecha,
        hora: colHora, terminal: colTerminal, dni: colDNI,
        jornada: colJornada, sector: colSector, empresa: colEmpresa,
      },
      stats: { withTerminal, withoutTerminal: values.length - withTerminal },
    };
    if (values.length === 0) {
      resp.debug = {
        message: 'Todas las filas fueron descartadas',
        skipped: { codigo: skippedCodigo, nombre: skippedNombre, fecha: skippedFecha },
        firstRow: rows[0],
      };
    }
    return NextResponse.json(resp);
  } catch (error) {
    console.error('Error uploading accesos:', error);
    return NextResponse.json({ error: 'Error procesando archivo de accesos', detail: String(error) }, { status: 500 });
  }
}

function parseExcelDate(raw: unknown): string {
  if (typeof raw === 'number' && raw > 0) {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (raw instanceof Date) return raw.toISOString().split('T')[0];
  if (typeof raw === 'string' && raw.includes('-')) return raw.split('T')[0];
  // Try dd/mm/yyyy or dd-mm-yyyy
  if (typeof raw === 'string' && raw.includes('/')) {
    const parts = raw.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${year}-${month}-${day}`;
    }
  }
  return '';
}

function parseExcelTime(raw: unknown): string {
  if (typeof raw === 'number' && raw > 0 && raw < 1) {
    // Excel time fraction of a day
    const totalSeconds = Math.round(raw * 86400);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (typeof raw === 'string' && raw.includes(':')) return raw.trim();
  if (raw instanceof Date) {
    return `${String(raw.getHours()).padStart(2, '0')}:${String(raw.getMinutes()).padStart(2, '0')}:${String(raw.getSeconds()).padStart(2, '0')}`;
  }
  return '';
}