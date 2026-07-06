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

interface TimeOutPair { salida: string; entrada: string; duracionSegundos: number; duracion: string; }
interface AccesoEvento { hora: string; terminal: string; }
interface EmployeeDay {
  codigoEmp: number; nombre: string; fecha: string; jornada: string; sector: string; empresa: string;
  turno: string;
  tiemposFuera: TimeOutPair[]; totalFueraSegundos: number; totalFuera: string;
  comidasHoras: string[]; facialRegistros: { hora: string; zona: string }[];
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
    const [accesosResult, comidasResult, facialResult] = await Promise.all([
      db.execute({ sql: 'SELECT * FROM AccessRecord ORDER BY fecha ASC, nombre ASC, hora ASC', args: [] }),
      db.execute({ sql: 'SELECT * FROM MealRecord ORDER BY fecha ASC, nombre ASC, hora ASC', args: [] }),
      db.execute({ sql: 'SELECT * FROM FacialRecord ORDER BY fecha ASC, persona ASC, hora ASC', args: [] }),
    ]);

    const accesos = accesosResult.rows as Record<string, unknown>[];
    const comidas = comidasResult.rows as Record<string, unknown>[];
    const facial = facialResult.rows as Record<string, unknown>[];

    if (accesos.length === 0) {
      return NextResponse.json({
        employees: [], ranking: [], turnos: [], rankingPorTurno: [],
        summary: { totalEmployees: 0, totalRecords: 0, totalComidas: 0, totalFacial: 0, avgOutsidePerEmployee: '00:00:00', dates: [] },
      });
    }

    // Build meal lookup — key by DNI|fecha, fallback to nombre|fecha
    const mealMap = new Map<string, string[]>();
    const mealMapByName = new Map<string, string[]>();
    for (const c of comidas) {
      const dni = String(c.dni ?? '').trim();
      const nombre = String(c.nombre ?? '').toUpperCase();
      const fecha = String(c.fecha ?? '');
      const dniKey = dni ? `${dni}|${fecha}` : '';
      const nameKey = `${nombre}|${fecha}`;
      if (dniKey) {
        if (!mealMap.has(dniKey)) mealMap.set(dniKey, []);
        mealMap.get(dniKey)!.push(String(c.hora ?? ''));
      }
      if (!mealMapByName.has(nameKey)) mealMapByName.set(nameKey, []);
      mealMapByName.get(nameKey)!.push(String(c.hora ?? ''));
    }

    // Build facial lookup — key by DNI|fecha, fallback to nombre|fecha
    const facialMap = new Map<string, { hora: string; zona: string }[]>();
    const facialMapByName = new Map<string, { hora: string; zona: string }[]>();
    for (const f of facial) {
      const dni = String(f.dni ?? '').trim();
      const persona = String(f.persona ?? '').toUpperCase();
      const fecha = String(f.fecha ?? '');
      const dniKey = dni ? `${dni}|${fecha}` : '';
      const nameKey = `${persona}|${fecha}`;
      const entry = { hora: String(f.hora ?? ''), zona: String(f.zona ?? '') };
      if (dniKey) {
        if (!facialMap.has(dniKey)) facialMap.set(dniKey, []);
        facialMap.get(dniKey)!.push(entry);
      }
      if (!facialMapByName.has(nameKey)) facialMapByName.set(nameKey, []);
      facialMapByName.get(nameKey)!.push(entry);
    }

    // Group access records by (codigoEmp, fecha)
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const a of accesos) {
      const key = `${a.codigoEmp}|${a.fecha}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(a);
    }

    // Extract unique dates
    const dateSet = new Set<string>();
    for (const a of accesos) dateSet.add(String(a.fecha));
    const dates = Array.from(dateSet).sort();

    // Build employee-day records
    const employees: EmployeeDay[] = [];

    for (const [, records] of grouped) {
      if (records.length === 0) continue;
      const sorted = [...records].sort((a, b) => timeToSeconds(String(a.hora ?? '')) - timeToSeconds(String(b.hora ?? '')));
      const first = sorted[0];

      // Determine turno from jornada field (contains TM, TT, TN)
      const jornadaRaw = String(first.jornada ?? '').toUpperCase().trim();
      let turno = 'OTRO';
      if (jornadaRaw.includes('TM')) turno = 'TM';
      else if (jornadaRaw.includes('TT')) turno = 'TT';
      else if (jornadaRaw.includes('TN')) turno = 'TN';

      const nombreKey = `${String(first.nombre ?? '').toUpperCase()}|${first.fecha}`;
      const dniKey = String(first.dni ?? '').trim() ? `${String(first.dni ?? '').trim()}|${String(first.fecha ?? '')}` : '';
      const comidasHoras = (dniKey && mealMap.has(dniKey)) ? mealMap.get(dniKey)! : (mealMapByName.get(nombreKey) || []);
      const facialRegistros = (dniKey && facialMap.has(dniKey)) ? facialMap.get(dniKey)! : (facialMapByName.get(nombreKey) || []);

      // Raw access events for timeline
      const accesosEventos: AccesoEvento[] = sorted.map(r => ({
        hora: String(r.hora ?? ''),
        terminal: String(r.terminal ?? ''),
      }));

      // Pair Salida Depo -> next Entrada Depo
      // For TN: exclude shift-change gaps (duration > 6h = not real "time outside")
      const isTN = turno === 'TN';
      const TN_MAX_GAP = 6 * 3600; // 6 hours

      const tiemposFuera: TimeOutPair[] = [];
      let i = 0;
      while (i < sorted.length) {
        if (String(sorted[i].terminal ?? '') === 'Salida Depo') {
          const salida = sorted[i];
          let entrada: Record<string, unknown> | null = null;
          for (let j = i + 1; j < sorted.length; j++) {
            if (String(sorted[j].terminal ?? '') === 'Entrada Depo') { entrada = sorted[j]; break; }
          }
          if (entrada) {
            let diff = timeToSeconds(String(entrada.hora ?? '')) - timeToSeconds(String(salida.hora ?? ''));
            if (diff < 0) diff += 86400;

            // For TN: skip if gap > 6h (shift change, not real time outside)
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
          }
        }
        i++;
      }

      const totalFueraSegundos = tiemposFuera.reduce((sum, t) => sum + t.duracionSegundos, 0);
      employees.push({
        codigoEmp: Number(first.codigoEmp ?? 0),
        nombre: String(first.nombre ?? ''),
        fecha: String(first.fecha ?? ''),
        jornada: String(first.jornada ?? '').trim(),
        sector: String(first.sector ?? ''),
        empresa: String(first.empresa ?? ''),
        turno,
        tiemposFuera, totalFueraSegundos, totalFuera: secondsToTime(totalFueraSegundos),
        comidasHoras, facialRegistros, accesosEventos,
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
        totalComidas: comidas.length,
        totalFacial: facial.length,
        avgOutsidePerEmployee: uniqueEmployees.size > 0 ? secondsToTime(Math.round(totalOutsideTime / uniqueEmployees.size)) : '00:00:00',
        dates,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return NextResponse.json({ error: 'Error obteniendo datos del dashboard', detail: String(error) }, { status: 500 });
  }
}