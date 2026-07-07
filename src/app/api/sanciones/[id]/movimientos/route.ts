import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function timeToSeconds(t: string): number {
  if (!t) return 0;
  const parts = t.split(':').map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  }
  return 0;
}

function secondsToTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get sancion to find employee info
    const sancionResult = await db.execute({
      sql: 'SELECT * FROM Sancion WHERE id = ? LIMIT 1',
      args: [id],
    });
    const row = sancionResult.rows[0] as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: 'Sancion no encontrada' }, { status: 404 });

    const codigoEmp = String(row.codigoEmp ?? '');
    const sancionFecha = String(row.fecha ?? '');
    const sancionTipo = String(row.tipo ?? '');
    const eventosJson = String(row.eventos ?? '');

    // ── 1. Get AccessRecord movements for this employee ──
    // For multiple-salidas without a specific fecha, get all dates
    let accessRows: Record<string, unknown>[] = [];
    if (sancionTipo === 'multiple-salidas' && !sancionFecha && eventosJson) {
      // Get all dates from eventos JSON
      try {
        const evts = JSON.parse(eventosJson) as { fecha: string }[];
        const dates = [...new Set(evts.map(e => e.fecha).filter(Boolean))];
        if (dates.length > 0) {
          const placeholders = dates.map(() => '?').join(',');
          const accResult = await db.execute({
            sql: `SELECT fecha, hora, terminal FROM AccessRecord WHERE codigoEmp = ? AND fecha IN (${placeholders}) ORDER BY fecha, hora ASC`,
            args: [codigoEmp, ...dates],
          });
          accessRows = accResult.rows as Record<string, unknown>[];
        }
      } catch {
        // fallback: get all access records for this employee
        const accResult = await db.execute({
          sql: 'SELECT fecha, hora, terminal FROM AccessRecord WHERE codigoEmp = ? ORDER BY fecha, hora ASC',
          args: [codigoEmp],
        });
        accessRows = accResult.rows as Record<string, unknown>[];
      }
    } else if (sancionFecha) {
      const accResult = await db.execute({
        sql: 'SELECT fecha, hora, terminal FROM AccessRecord WHERE codigoEmp = ? AND fecha = ? ORDER BY hora ASC',
        args: [codigoEmp, sancionFecha],
      });
      accessRows = accResult.rows as Record<string, unknown>[];
    } else {
      // No fecha, not multiple-salidas: get all
      const accResult = await db.execute({
        sql: 'SELECT fecha, hora, terminal FROM AccessRecord WHERE codigoEmp = ? ORDER BY fecha, hora ASC',
        args: [codigoEmp],
      });
      accessRows = accResult.rows as Record<string, unknown>[];
    }

    // ── 2. Get AuxRecord (facial/comida) by DNI ──
    let dni = '';
    if (accessRows.length > 0) {
      const dniResult = await db.execute({
        sql: 'SELECT dni FROM AccessRecord WHERE codigoEmp = ? LIMIT 1',
        args: [codigoEmp],
      });
      if (dniResult.rows.length > 0) {
        dni = String((dniResult.rows[0] as Record<string, unknown>).dni ?? '').trim();
      }
    }

    let auxRows: Record<string, unknown>[] = [];
    if (dni) {
      if (sancionTipo === 'multiple-salidas' && !sancionFecha && eventosJson) {
        try {
          const evts = JSON.parse(eventosJson) as { fecha: string }[];
          const dates = [...new Set(evts.map(e => e.fecha).filter(Boolean))];
          if (dates.length > 0) {
            const placeholders = dates.map(() => '?').join(',');
            const auxResult = await db.execute({
              sql: `SELECT fecha, hora, tipo, detalle FROM AuxRecord WHERE dni = ? AND fecha IN (${placeholders}) ORDER BY fecha, hora ASC`,
              args: [dni, ...dates],
            });
            auxRows = auxResult.rows as Record<string, unknown>[];
          }
        } catch {
          const auxResult = await db.execute({
            sql: 'SELECT fecha, hora, tipo, detalle FROM AuxRecord WHERE dni = ? ORDER BY fecha, hora ASC',
            args: [dni],
          });
          auxRows = auxResult.rows as Record<string, unknown>[];
        }
      } else if (sancionFecha) {
        const auxResult = await db.execute({
          sql: 'SELECT fecha, hora, tipo, detalle FROM AuxRecord WHERE dni = ? AND fecha = ? ORDER BY hora ASC',
          args: [dni, sancionFecha],
        });
        auxRows = auxResult.rows as Record<string, unknown>[];
      } else {
        const auxResult = await db.execute({
          sql: 'SELECT fecha, hora, tipo, detalle FROM AuxRecord WHERE dni = ? ORDER BY fecha, hora ASC',
          args: [dni],
        });
        auxRows = auxResult.rows as Record<string, unknown>[];
      }
    }

    // ── 3. Build unified timeline ──
    const timeline: { fecha: string; hora: string; evento: string; tipo: string; duracion: string }[] = [];

    // Add access records
    for (const ar of accessRows) {
      const fecha = String(ar.fecha ?? '');
      const hora = String(ar.hora ?? '');
      const terminal = String(ar.terminal ?? '');
      // Only include salida/entrada depósito events
      if (terminal.toLowerCase().includes('salida') || terminal.toLowerCase().includes('entrada')) {
        timeline.push({
          fecha,
          hora,
          evento: terminal,
          tipo: 'Acceso',
          duracion: '',
        });
      }
    }

    // Add aux records (facial/comida)
    for (const aux of auxRows) {
      const fecha = String(aux.fecha ?? '');
      const hora = String(aux.hora ?? '');
      const tipo = String(aux.tipo ?? '');
      const detalle = String(aux.detalle ?? '');
      timeline.push({
        fecha,
        hora,
        evento: detalle || (tipo === 'FACIAL' ? 'Registro Facial' : 'TK Comida'),
        tipo: tipo === 'FACIAL' ? 'Facial' : 'Comida',
        duracion: '',
      });
    }

    // Sort by fecha + hora
    timeline.sort((a, b) => {
      const fc = a.fecha.localeCompare(b.fecha);
      if (fc !== 0) return fc;
      return a.hora.localeCompare(b.hora);
    });

    // ── 4. Calculate duration between each Salida Depo and next Entrada Depo ──
    for (let i = 0; i < timeline.length; i++) {
      const mov = timeline[i];
      if (mov.tipo === 'Acceso' && mov.evento.toLowerCase().includes('salida')) {
        // Find next Entrada on the same date
        for (let j = i + 1; j < timeline.length; j++) {
          const next = timeline[j];
          if (next.fecha !== mov.fecha) break; // different date, stop
          if (next.tipo === 'Acceso' && next.evento.toLowerCase().includes('entrada')) {
            const salidaSecs = timeToSeconds(mov.hora);
            const entradaSecs = timeToSeconds(next.hora);
            const diff = entradaSecs - salidaSecs;
            if (diff > 0) {
              mov.duracion = secondsToTime(diff);
              // Also mark the entrada with the same duration for reference
              next.duracion = secondsToTime(diff);
            }
            break;
          }
        }
      }
    }

    return NextResponse.json(timeline);
  } catch (error) {
    console.error('Error fetching movimientos:', error);
    return NextResponse.json({ error: 'Error al obtener movimientos' }, { status: 500 });
  }
}