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

function addDays(fecha: string, n: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  const d = new Date(fecha + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Corte de madrugada: fichadas anteriores a las 07:00 de un dia pertenecen a
// la jornada TN anterior (si hubo presencia nocturna). Misma regla que el
// dashboard: la salida final del turno TN ("despues de las 6") cierra la
// jornada previa.
const EARLY_CUTOFF_SEC = 7 * 3600;
// Ventana TN que NO cuenta como tiempo fuera de deposito: 22:00-23:00.
const TN_PRE_SHIFT_START = 22 * 3600;
const TN_PRE_SHIFT_END = 23 * 3600;

interface TimelineRow {
  fecha: string; // fecha real de la fichada (para mostrar)
  jornadaFecha: string; // fecha de la jornada a la que pertenece (TN cruza medianoche)
  hora: string;
  evento: string;
  tipo: string;
  duracion: string;
  entradaHora?: string;
  duracionSegundos?: number;
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

    // ── 0. Target JORNADA fechas ──
    // La jornada TN del dia D arranca 23:00 de D y termina ~05:20 de D+1:
    // las fichadas de madrugada de D+1 pertenecen a la jornada D.
    let targetFechas: string[] = [];
    if (sancionTipo === 'multiple-salidas' && !sancionFecha && eventosJson) {
      try {
        const evts = JSON.parse(eventosJson) as { fecha: string }[];
        targetFechas = [...new Set(evts.map(e => e.fecha).filter(Boolean))];
      } catch {
        targetFechas = [];
      }
    } else if (sancionFecha) {
      targetFechas = [sancionFecha];
    }

    // Rango calendario a traer: jornada F necesita fichadas de F y F+1
    // (madrugada), y la presencia nocturna de F-1 decide si las madrugadas
    // de F vuelven a la jornada anterior.
    let calendarFechas: string[] = [];
    if (targetFechas.length > 0) {
      const set = new Set<string>();
      for (const f of targetFechas) {
        set.add(addDays(f, -1));
        set.add(f);
        set.add(addDays(f, 1));
      }
      calendarFechas = [...set];
    }

    // ── 1. Access records ──
    let accessRows: Record<string, unknown>[] = [];
    if (calendarFechas.length > 0) {
      const placeholders = calendarFechas.map(() => '?').join(',');
      const accResult = await db.execute({
        sql: `SELECT fecha, hora, terminal, dni FROM AccessRecord WHERE codigoEmp = ? AND fecha IN (${placeholders}) ORDER BY fecha, hora ASC`,
        args: [codigoEmp, ...calendarFechas],
      });
      accessRows = accResult.rows as Record<string, unknown>[];
    } else {
      const accResult = await db.execute({
        sql: 'SELECT fecha, hora, terminal, dni FROM AccessRecord WHERE codigoEmp = ? ORDER BY fecha, hora ASC',
        args: [codigoEmp],
      });
      accessRows = accResult.rows as Record<string, unknown>[];
    }

    // Presencia nocturna por fecha calendario del legajo. Decide si las
    // fichadas de madrugada (< 06:00) de un dia pertenecen a la jornada
    // anterior (jornada TN que cruza medianoche). Noche en F = alguna fichada
    // >= 23:00 en F, O la ultima fichada Depo (Entrada/Salida) de F es una
    // Entrada >= 18:00 (entro por la tarde/noche y nunca marco salida ->
    // trabajo nocturno, cubre turnos que arrancan 18:00-23:00).
    const dayHasNight23 = new Set<string>();
    const dayLastSwipe = new Map<string, { sec: number; term: string }>();
    for (const ar of accessRows) {
      const h = String(ar.hora ?? '').trim();
      if (!h) continue;
      const sec = timeToSeconds(h);
      const f = String(ar.fecha ?? '');
      const term = String(ar.terminal ?? '').trim().toLowerCase();
      if (sec >= 23 * 3600) dayHasNight23.add(f);
      if (term.includes('entrada') || term.includes('salida')) {
        const cur = dayLastSwipe.get(f);
        if (!cur || sec >= cur.sec) dayLastSwipe.set(f, { sec, term });
      }
    }
    const isNightFecha = (f: string): boolean => {
      if (dayHasNight23.has(f)) return true;
      const last = dayLastSwipe.get(f);
      return !!last && last.term.includes('entrada') && last.sec >= 18 * 3600;
    };

    // Anota cada fichada con su jornada y filtra a las jornadas objetivo
    const annotated = accessRows
      .map(ar => {
        const h = String(ar.hora ?? '').trim();
        if (!h) return null;
        const fechaReal = String(ar.fecha ?? '');
        let jf = fechaReal;
        if (timeToSeconds(h) < EARLY_CUTOFF_SEC && isNightFecha(addDays(fechaReal, -1))) {
          jf = addDays(fechaReal, -1);
        }
        return { fecha: fechaReal, jornadaFecha: jf, hora: h, terminal: String(ar.terminal ?? '') };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter(x => targetFechas.length === 0 || targetFechas.includes(x.jornadaFecha));

    // ── 2. Aux records (facial/comida) by DNI ──
    let dni = '';
    for (const ar of accessRows) {
      const d = String(ar.dni ?? '').trim();
      if (d) { dni = d; break; }
    }

    let auxAnnotated: { fecha: string; jornadaFecha: string; hora: string; tipo: string; detalle: string }[] = [];
    if (dni) {
      let rawAux: Record<string, unknown>[] = [];
      if (calendarFechas.length > 0) {
        const placeholders = calendarFechas.map(() => '?').join(',');
        const auxResult = await db.execute({
          sql: `SELECT fecha, hora, tipo, detalle FROM AuxRecord WHERE dni = ? AND fecha IN (${placeholders}) ORDER BY fecha, hora ASC`,
          args: [dni, ...calendarFechas],
        });
        rawAux = auxResult.rows as Record<string, unknown>[];
      } else {
        const auxResult = await db.execute({
          sql: 'SELECT fecha, hora, tipo, detalle FROM AuxRecord WHERE dni = ? ORDER BY fecha, hora ASC',
          args: [dni],
        });
        rawAux = auxResult.rows as Record<string, unknown>[];
      }

      const dniHasNight23 = new Set<string>();
      const dniLastSwipe = new Map<string, { sec: number; term: string }>();
      for (const ar of accessRows) {
        const h = String(ar.hora ?? '').trim();
        const d = String(ar.dni ?? '').trim();
        if (!h || !d) continue;
        const sec = timeToSeconds(h);
        const f = String(ar.fecha ?? '');
        const term = String(ar.terminal ?? '').trim().toLowerCase();
        if (sec >= 23 * 3600) dniHasNight23.add(`${d}|${f}`);
        if (term.includes('entrada') || term.includes('salida')) {
          const key = `${d}|${f}`;
          const cur = dniLastSwipe.get(key);
          if (!cur || sec >= cur.sec) dniLastSwipe.set(key, { sec, term });
        }
      }
      const isNightDni = (d: string, f: string): boolean => {
        const key = `${d}|${f}`;
        if (dniHasNight23.has(key)) return true;
        const last = dniLastSwipe.get(key);
        return !!last && last.term.includes('entrada') && last.sec >= 18 * 3600;
      };

      auxAnnotated = rawAux
        .map(ar => {
          const h = String(ar.hora ?? '').trim();
          if (!h) return null;
          const fechaReal = String(ar.fecha ?? '');
          let jf = fechaReal;
          if (timeToSeconds(h) < EARLY_CUTOFF_SEC && isNightDni(dni, addDays(fechaReal, -1))) {
            jf = addDays(fechaReal, -1);
          }
          return { fecha: fechaReal, jornadaFecha: jf, hora: h, tipo: String(ar.tipo ?? ''), detalle: String(ar.detalle ?? '') };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .filter(x => targetFechas.length === 0 || targetFechas.includes(x.jornadaFecha));
    }

    // ── 3. Build unified timeline (orden real: fecha + hora) ──
    const timeline: TimelineRow[] = [];

    for (const ar of annotated) {
      const terminal = ar.terminal;
      if (terminal.toLowerCase().includes('salida') || terminal.toLowerCase().includes('entrada')) {
        timeline.push({
          fecha: ar.fecha,
          jornadaFecha: ar.jornadaFecha,
          hora: ar.hora,
          evento: terminal,
          tipo: 'Acceso',
          duracion: '',
        });
      }
    }

    for (const aux of auxAnnotated) {
      timeline.push({
        fecha: aux.fecha,
        jornadaFecha: aux.jornadaFecha,
        hora: aux.hora,
        evento: aux.detalle || (aux.tipo === 'FACIAL' ? 'Registro Facial' : 'TK Comida'),
        tipo: aux.tipo === 'FACIAL' ? 'Facial' : 'Comida',
        duracion: '',
      });
    }

    timeline.sort((a, b) => {
      const fc = a.fecha.localeCompare(b.fecha);
      if (fc !== 0) return fc;
      return a.hora.localeCompare(b.hora);
    });

    // ── 4. Inferir jornadas TN (presencia nocturna + madrugada) ──
    // Jornada TN = noche en la fecha de la jornada (misma regla que el
    // dashboard) + fichadas de madrugada (< 07:00) asignadas a esa jornada.
    const jfEarly = new Set<string>();
    for (const ar of annotated) {
      if (timeToSeconds(ar.hora) < EARLY_CUTOFF_SEC) jfEarly.add(ar.jornadaFecha);
    }
    const tnJornadas = new Set<string>();
    for (const jf of jfEarly) {
      if (isNightFecha(jf)) tnJornadas.add(jf);
    }

    // ── 5. Pair Salida Depo -> Entrada Depo (misma jornada, cada entrada se consume una vez) ──
    const usedEntradas = new Set<number>();
    for (let i = 0; i < timeline.length; i++) {
      const mov = timeline[i];
      if (mov.tipo === 'Acceso' && mov.evento.toLowerCase().includes('salida')) {
        const salidaSecs = timeToSeconds(mov.hora);
        for (let j = i + 1; j < timeline.length; j++) {
          const next = timeline[j];
          if (next.jornadaFecha !== mov.jornadaFecha) break; // cambio de jornada
          if (usedEntradas.has(j)) continue;
          if (next.tipo === 'Acceso' && next.evento.toLowerCase().includes('entrada')) {
            let diff = timeToSeconds(next.hora) - salidaSecs;
            if (diff < 0) diff += 86400; // par que cruza medianoche dentro de la jornada TN
            const gapOk = !tnJornadas.has(mov.jornadaFecha) || diff <= 7 * 3600;
            // TN: la ventana 22:00-23:00 (previa al inicio del turno) no cuenta
            // como tiempo fuera de deposito. Se descuenta del par; si el par
            // queda completamente dentro de la ventana no se cuenta.
            if (tnJornadas.has(mov.jornadaFecha)) {
              const overlap = Math.min(salidaSecs + diff, TN_PRE_SHIFT_END) - Math.max(salidaSecs, TN_PRE_SHIFT_START);
              if (overlap > 0) diff -= overlap;
            }
            if (diff > 0 && gapOk) {
              mov.duracion = secondsToTime(diff);
              mov.duracionSegundos = diff;
              mov.entradaHora = next.hora;
              usedEntradas.add(j);
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
