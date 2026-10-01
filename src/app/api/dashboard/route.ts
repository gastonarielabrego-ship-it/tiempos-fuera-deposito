import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

function timeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return (Number(parts[0]) || 0) * 3600 + (Number(parts[1]) || 0) * 60 + (Number(parts[2]) || 0);
}

function secondsToTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function addDays(fecha: string, n: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  const d = new Date(fecha + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface TimeOutPair { salida: string; entrada: string; duracionSegundos: number; duracion: string; }
interface AccesoEvento { fecha: string; hora: string; terminal: string; }
interface EmployeeDay {
  codigoEmp: number; nombre: string; fecha: string; jornada: string; sector: string; empresa: string;
  turno: string;
  jornadaInicio: string; jornadaFin: string; cruzaMedianoche: boolean;
  tiemposFuera: TimeOutPair[]; totalFueraSegundos: number; totalFuera: string;
  comidasRegistros: { fecha: string; hora: string }[]; facialRegistros: { fecha: string; hora: string; zona: string }[];
  accesosEventos: AccesoEvento[];
}
interface RankingEntry {
  codigoEmp: number; nombre: string; empresa: string; sector: string;
  totalFueraSegundos: number; totalFuera: string;
  diasCount: number; avgPorDia: string; maxDiaFuera: string; maxDiaFecha: string;
  eventosCount: number;
}
interface TurnoRanking { turno: string; label: string; totalFueraSegundos: number; totalFuera: string; eventosCount: number; empleados: RankingEntry[]; }

export async function GET() {
  try {
    // Try to create AuxRecord table (may fail on some Turso configs - that's OK)
    try {
      await db.execute({
        sql: `CREATE TABLE IF NOT EXISTS AuxRecord (
          id TEXT PRIMARY KEY,
          dni TEXT,
          nombre TEXT,
          fecha TEXT,
          hora TEXT,
          tipo TEXT,
          detalle TEXT,
          createdAt TEXT
        )`,
        args: [],
      });
    } catch { /* non-critical */ }

    // Fetch accesos, and try aux records (graceful fallback if table doesn't exist)
    const accesosResult = await db.execute({ sql: 'SELECT * FROM AccessRecord ORDER BY fecha ASC, nombre ASC, hora ASC', args: [] });
    const accesos = accesosResult.rows as Record<string, unknown>[];

    let auxRecords: Record<string, unknown>[] = [];
    try {
      const auxResult = await db.execute({ sql: 'SELECT * FROM AuxRecord ORDER BY fecha ASC, nombre ASC, hora ASC', args: [] });
      auxRecords = auxResult.rows as Record<string, unknown>[];
    } catch {
      // AuxRecord table doesn't exist yet - continue without it
      auxRecords = [];
    }

    if (accesos.length === 0) {
      return NextResponse.json({
        employees: [], ranking: [], turnos: [], rankingPorTurno: [],
        summary: { totalEmployees: 0, totalRecords: 0, totalComidas: 0, totalFacial: 0, avgOutsidePerEmployee: '00:00:00', dates: [] },
      });
    }

    // Build lookup map from AuxRecord by DNI only
    // Key: dni|fechaJornada  |  Value: { faciales: {fecha, hora, zona}[], comidas: {fecha, hora}[] }
    const auxMap = new Map<string, { faciales: { fecha: string; hora: string; zona: string }[]; comidas: { fecha: string; hora: string }[] }>();

    let totalComidas = 0;
    let totalFacial = 0;

    // Pre-pass: night presence per (employee, calendar fecha). Decides TN
    // jornadas that span midnight: jornada D = evening/night of D (18:00+)
    // + early morning of D+1 (< 06:00).
    // Night presence on D = any record at/after 23:00, OR the last depot
    // swipe (Entrada/Salida) of D being an Entrada >= 18:00: the worker
    // entered in the evening and never swiped out, so the night belongs to
    // jornada D even without a 23:00+ record (covers TN shifts that start
    // 18:00-23:00, e.g. entra 21:44 y sale 05:22 del dia siguiente).
    const dayHasNight23 = new Set<string>();
    const dayLastSwipe = new Map<string, { sec: number; term: string }>();
    const dniHasNight23 = new Set<string>();
    const dniLastSwipe = new Map<string, { sec: number; term: string }>();

    const isNightKey = (
      hasNight: Set<string>,
      lastSwipe: Map<string, { sec: number; term: string }>,
      key: string,
    ): boolean => {
      if (hasNight.has(key)) return true;
      const last = lastSwipe.get(key);
      return !!last && last.term.toLowerCase().includes('entrada') && last.sec >= 18 * 3600;
    };

    for (const a of accesos) {
      const h = String(a.hora ?? '').trim();
      if (!h) continue;
      const sec = timeToSeconds(h);
      const fecha = String(a.fecha ?? '');
      const term = String(a.terminal ?? '').trim();
      const isSwipe = term.toLowerCase().includes('entrada') || term.toLowerCase().includes('salida');
      const codKey = `${a.codigoEmp}|${fecha}`;
      if (sec >= 23 * 3600) dayHasNight23.add(codKey);
      if (isSwipe) {
        const cur = dayLastSwipe.get(codKey);
        if (!cur || sec >= cur.sec) dayLastSwipe.set(codKey, { sec, term });
      }
      const dni = String(a.dni ?? '').trim();
      if (dni) {
        const dKey = `${dni}|${fecha}`;
        if (sec >= 23 * 3600) dniHasNight23.add(dKey);
        if (isSwipe) {
          const cur = dniLastSwipe.get(dKey);
          if (!cur || sec >= cur.sec) dniLastSwipe.set(dKey, { sec, term });
        }
      }
    }
    const isNightCod = (codigo: unknown, fecha: string) =>
      isNightKey(dayHasNight23, dayLastSwipe, `${codigo}|${fecha}`);
    const isNightDni = (dni: string, fecha: string) =>
      isNightKey(dniHasNight23, dniLastSwipe, `${dni}|${fecha}`);

    for (const r of auxRecords) {
      const dni = String(r.dni ?? '').trim();
      const fecha = String(r.fecha ?? '');
      const hora = String(r.hora ?? '').trim();
      const tipo = String(r.tipo ?? '');
      const detalle = String(r.detalle ?? '');

      if (tipo === 'COMIDA') totalComidas++;
      if (tipo === 'FACIAL') totalFacial++;

      if (!dni) continue;
      // TN jornada: early-morning aux (hora < 06:00) belongs to the previous day's jornada
      let fechaJornada = fecha;
      if (hora && timeToSeconds(hora) < 6 * 3600 && isNightDni(dni, addDays(fecha, -1))) {
        fechaJornada = addDays(fecha, -1);
      }
      const key = `${dni}|${fechaJornada}`;
      if (!auxMap.has(key)) auxMap.set(key, { faciales: [], comidas: [] });
      const entry = auxMap.get(key)!;
      if (tipo === 'FACIAL') entry.faciales.push({ fecha, hora, zona: detalle });
      if (tipo === 'COMIDA') entry.comidas.push({ fecha, hora });
    }

    // Group access records by (codigoEmp, jornada)
    // TN jornada D = records of D from 06:00 onwards + early-morning records of
    // D+1 (< 06:00) when the employee had night presence on D (>= 23:00, or
    // last swipe of D being an Entrada >= 18:00).
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const a of accesos) {
      const h = String(a.hora ?? '').trim();
      if (!h) continue; // skip records without a valid time
      const horaSec = timeToSeconds(h);
      let fechaJornada = String(a.fecha ?? '');
      if (horaSec < 6 * 3600 && isNightCod(a.codigoEmp, addDays(fechaJornada, -1))) {
        fechaJornada = addDays(fechaJornada, -1);
      }
      const key = `${a.codigoEmp}|${fechaJornada}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(a);
    }

    // Extract unique jornada dates
    const dateSet = new Set<string>();
    for (const key of grouped.keys()) dateSet.add(key.split('|')[1]);
    const dates = Array.from(dateSet).sort();

    // Build employee-day records
    const employees: EmployeeDay[] = [];

    for (const [groupKey, records] of grouped) {
      if (records.length === 0) continue;
      // Sort by real date, then time (TN jornadas span two calendar days)
      const sorted = [...records].sort((a, b) => {
        const fc = String(a.fecha ?? '').localeCompare(String(b.fecha ?? ''));
        if (fc !== 0) return fc;
        return timeToSeconds(String(a.hora ?? '')) - timeToSeconds(String(b.hora ?? ''));
      });
      const first = sorted[0];
      const jornadaFecha = groupKey.split('|')[1] || String(first.fecha ?? '');

      // Determine turno: use jornada field when present (contains TM/TT/TN);
      // otherwise infer TN when the shift spans midnight: night presence on
      // the jornada fecha + early-morning (< 06:00) records of the next day.
      const jornadaRaw = String(first.jornada ?? '').toUpperCase().trim();
      let turno = 'OTRO';
      if (jornadaRaw.includes('TM')) turno = 'TM';
      else if (jornadaRaw.includes('TT')) turno = 'TT';
      else if (jornadaRaw.includes('TN')) turno = 'TN';
      const hasNight = isNightCod(first.codigoEmp, jornadaFecha);
      const hasEarly = sorted.some(r => timeToSeconds(String(r.hora ?? '').trim()) < 6 * 3600);
      if (turno === 'OTRO' && hasNight && hasEarly) turno = 'TN';

      const dni = String(first.dni ?? '').trim();
      const dniKey = dni ? `${dni}|${jornadaFecha}` : '';
      const auxData = (dniKey && auxMap.has(dniKey)) ? auxMap.get(dniKey)! : { faciales: [], comidas: [] };

      // Raw access events for timeline (fecha real de cada fichada)
      const accesosEventos: AccesoEvento[] = sorted.map(r => ({
        fecha: String(r.fecha ?? ''),
        hora: String(r.hora ?? ''),
        terminal: String(r.terminal ?? ''),
      }));

      // Pair Salida Depo -> next unconsumed Entrada Depo
      // Each Entrada Depo can only be consumed by ONE Salida Depo, so duplicate
      // swipes (consecutive Salida Depo) no longer multiply the time outside.
      // Pairs may span midnight inside a TN jornada (diff < 0 -> +24h).
      const isTN = turno === 'TN';
      const TN_MAX_GAP = 7 * 3600; // TN jornada spans 23:00-06:00 (7h): bigger gaps are day strays

      const tiemposFuera: TimeOutPair[] = [];
      const usedEntradas = new Set<number>();
      let i = 0;
      while (i < sorted.length) {
        if (String(sorted[i].terminal ?? '') === 'Salida Depo') {
          const salida = sorted[i];
          const salidaSec = timeToSeconds(String(salida.hora ?? '').trim());

          let entrada: Record<string, unknown> | null = null;
          let entradaIdx = -1;
          for (let j = i + 1; j < sorted.length; j++) {
            if (usedEntradas.has(j)) continue;
            if (String(sorted[j].terminal ?? '') === 'Entrada Depo') { entrada = sorted[j]; entradaIdx = j; break; }
          }
          if (entrada) {
            let diff = timeToSeconds(String(entrada.hora ?? '').trim()) - salidaSec;
            if (diff < 0) diff += 86400;

            // For TN: skip gaps longer than the shift window (day strays / shift change)
            if (isTN && diff > TN_MAX_GAP) {
              i++;
              continue;
            }

            tiemposFuera.push({
              salida: String(salida.hora ?? ''),
              entrada: String(entrada.hora ?? ''),
              duracionSegundos: diff,
              duracion: secondsToTime(diff),
            });
            usedEntradas.add(entradaIdx);
          }
        }
        i++;
      }

      const totalFueraSegundos = tiemposFuera.reduce((sum, t) => sum + t.duracionSegundos, 0);
      // Ventana efectiva de la jornada: primera y ultima fichada (se calcula,
      // la BD no tiene columna "jornada efectiva")
      const firstEv = sorted[0];
      const lastEv = sorted[sorted.length - 1];
      const jInicio = String(firstEv.hora ?? '').trim();
      const jFin = String(lastEv.hora ?? '').trim();
      const cruza = String(lastEv.fecha ?? '') > String(firstEv.fecha ?? '');
      employees.push({
        codigoEmp: Number(first.codigoEmp ?? 0),
        nombre: String(first.nombre ?? ''),
        fecha: jornadaFecha,
        jornada: String(first.jornada ?? '').trim(),
        sector: String(first.sector ?? ''),
        empresa: String(first.empresa ?? ''),
        turno,
        jornadaInicio: jInicio,
        jornadaFin: jFin,
        cruzaMedianoche: cruza,
        tiemposFuera, totalFueraSegundos, totalFuera: secondsToTime(totalFueraSegundos),
        comidasRegistros: auxData.comidas, facialRegistros: auxData.faciales, accesosEventos,
      });
    }

    employees.sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return a.nombre.localeCompare(b.nombre);
    });

    // Build ranking: aggregate by employee across all dates, grouped by turno
    const turnoRankingMap = new Map<string, Map<number, {
      codigoEmp: number; nombre: string; empresa: string; sector: string;
      totalFueraSegundos: number; dias: Set<string>; diasConFuera: number[];
      maxDia: { seg: number; fecha: string }; eventosCount: number;
    }>>();

    for (const emp of employees) {
      const t = emp.turno;
      if (!turnoRankingMap.has(t)) turnoRankingMap.set(t, new Map());
      const turnoMap = turnoRankingMap.get(t)!;

      if (!turnoMap.has(emp.codigoEmp)) {
        turnoMap.set(emp.codigoEmp, {
          codigoEmp: emp.codigoEmp, nombre: emp.nombre, empresa: emp.empresa, sector: emp.sector,
          totalFueraSegundos: 0, dias: new Set(), diasConFuera: [],
          maxDia: { seg: 0, fecha: '' }, eventosCount: 0,
        });
      }
      const entry = turnoMap.get(emp.codigoEmp)!;
      entry.totalFueraSegundos += emp.totalFueraSegundos;
      entry.dias.add(emp.fecha);
      entry.eventosCount += emp.tiemposFuera.length;
      if (emp.totalFueraSegundos > 0) entry.diasConFuera.push(emp.totalFueraSegundos);
      if (emp.totalFueraSegundos > entry.maxDia.seg) {
        entry.maxDia = { seg: emp.totalFueraSegundos, fecha: emp.fecha };
      }
    }

    const turnoLabels: Record<string, string> = { TM: 'Mañana (06:00–09:00)', TT: 'Tarde (10:00–14:00)', TN: 'Noche (18:00–00:00)' };
    const turnoOrder = ['TM', 'TT', 'TN'];

    const rankingPorTurno: TurnoRanking[] = turnoOrder
      .filter(t => turnoRankingMap.has(t))
      .map(t => {
        const map = turnoRankingMap.get(t)!;
        const empleados = Array.from(map.values())
          .map(r => ({
            codigoEmp: r.codigoEmp, nombre: r.nombre, empresa: r.empresa, sector: r.sector,
            totalFueraSegundos: r.totalFueraSegundos, totalFuera: secondsToTime(r.totalFueraSegundos),
            diasCount: r.dias.size,
            avgPorDia: r.diasConFuera.length > 0 ? secondsToTime(Math.round(r.totalFueraSegundos / r.diasConFuera.length)) : '00:00:00',
            maxDiaFuera: secondsToTime(r.maxDia.seg), maxDiaFecha: r.maxDia.fecha,
            eventosCount: r.eventosCount,
          }))
          .sort((a, b) => b.totalFueraSegundos - a.totalFueraSegundos);
        const totalFuera = empleados.reduce((s, e) => s + e.totalFueraSegundos, 0);
        const totalEventos = empleados.reduce((s, e) => s + e.eventosCount, 0);
        return { turno: t, label: turnoLabels[t], totalFueraSegundos: totalFuera, totalFuera: secondsToTime(totalFuera), eventosCount: totalEventos, empleados };
      });

    // Also build a flat ranking (only TM, TT, TN — exclude OTRO)
    const validTurnos = new Set(['TM', 'TT', 'TN']);
    const allRankingMap = new Map<number, {
      codigoEmp: number; nombre: string; empresa: string; sector: string;
      totalFueraSegundos: number; dias: Set<string>; diasConFuera: number[];
      maxDia: { seg: number; fecha: string }; eventosCount: number;
    }>();
    for (const [turnoKey, turnoMap] of turnoRankingMap) {
      if (!validTurnos.has(turnoKey)) continue;
      for (const [, v] of turnoMap) {
        if (!allRankingMap.has(v.codigoEmp)) {
          allRankingMap.set(v.codigoEmp, { ...v, dias: new Set(v.dias), diasConFuera: [...v.diasConFuera], eventosCount: v.eventosCount });
        } else {
          const existing = allRankingMap.get(v.codigoEmp)!;
          existing.totalFueraSegundos += v.totalFueraSegundos;
          existing.eventosCount += v.eventosCount;
          for (const d of v.dias) existing.dias.add(d);
          existing.diasConFuera.push(...v.diasConFuera);
          if (v.maxDia.seg > existing.maxDia.seg) existing.maxDia = v.maxDia;
        }
      }
    }

    const ranking: RankingEntry[] = Array.from(allRankingMap.values())
      .map(r => ({
        codigoEmp: r.codigoEmp, nombre: r.nombre, empresa: r.empresa, sector: r.sector,
        totalFueraSegundos: r.totalFueraSegundos, totalFuera: secondsToTime(r.totalFueraSegundos),
        diasCount: r.dias.size,
        avgPorDia: r.diasConFuera.length > 0 ? secondsToTime(Math.round(r.totalFueraSegundos / r.diasConFuera.length)) : '00:00:00',
        maxDiaFuera: secondsToTime(r.maxDia.seg), maxDiaFecha: r.maxDia.fecha,
        eventosCount: r.eventosCount,
      }))
      .sort((a, b) => b.totalFueraSegundos - a.totalFueraSegundos);

    const uniqueEmployees = new Set(employees.map(e => e.codigoEmp));
    const totalOutsideTime = employees.reduce((sum, e) => sum + e.totalFueraSegundos, 0);

    return NextResponse.json({
      employees,
      ranking,
      rankingPorTurno,
      turnos: turnoOrder.filter(t => turnoRankingMap.has(t)),
      summary: {
        totalEmployees: uniqueEmployees.size,
        totalRecords: accesos.length,
        totalComidas,
        totalFacial,
        avgOutsidePerEmployee: uniqueEmployees.size > 0 ? secondsToTime(Math.round(totalOutsideTime / uniqueEmployees.size)) : '00:00:00',
        dates,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return NextResponse.json({ error: 'Error obteniendo datos del dashboard', detail: String(error) }, { status: 500 });
  }
}