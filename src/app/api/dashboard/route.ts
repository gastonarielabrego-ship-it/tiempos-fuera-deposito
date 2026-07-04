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
      return NextResponse.json({ employees: [], dates: [], summary: { totalEmployees: 0, totalRecords: 0, totalComidas: 0, totalFacial: 0, avgOutsidePerEmployee: '00:00:00', dates: [] } });
    }

    const mealMap = new Map<string, string[]>();
    for (const c of comidas) {
      const key = `${String(c.nombre ?? '').toUpperCase()}|${c.fecha}`;
      if (!mealMap.has(key)) mealMap.set(key, []);
      mealMap.get(key)!.push(String(c.hora ?? ''));
    }

    const facialMap = new Map<string, { hora: string; zona: string }[]>();
    for (const f of facial) {
      const key = `${String(f.persona ?? '').toUpperCase()}|${f.fecha}`;
      if (!facialMap.has(key)) facialMap.set(key, []);
      facialMap.get(key)!.push({ hora: String(f.hora ?? ''), zona: String(f.zona ?? '') });
    }

    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const a of accesos) {
      const key = `${a.codigoEmp}|${a.fecha}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(a);
    }

    const dateSet = new Set<string>();
    for (const a of accesos) dateSet.add(String(a.fecha));
    const dates = Array.from(dateSet).sort();

    interface TimeOutPair { salida: string; entrada: string; duracionSegundos: number; duracion: string; }
    interface EmployeeDay {
      codigoEmp: number; nombre: string; fecha: string; jornada: string; sector: string; empresa: string;
      tiemposFuera: TimeOutPair[]; totalFueraSegundos: number; totalFuera: string;
      comidasHoras: string[]; facialRegistros: { hora: string; zona: string }[];
    }

    const employees: EmployeeDay[] = [];

    for (const [, records] of grouped) {
      if (records.length === 0) continue;
      const sorted = [...records].sort((a, b) => timeToSeconds(String(a.hora ?? '')) - timeToSeconds(String(b.hora ?? '')));
      const first = sorted[0];

      const nombreKey = `${String(first.nombre ?? '').toUpperCase()}|${first.fecha}`;
      const comidasHoras = mealMap.get(nombreKey) || [];
      const facialRegistros = facialMap.get(nombreKey) || [];

      const tiemposFuera: TimeOutPair[] = [];
      let i = 0;
      while (i < sorted.length) {
        if (String(sorted[i].terminal ?? '') === 'Salida Depo') {
          const salida = sorted[i];
          let entrada = null;
          for (let j = i + 1; j < sorted.length; j++) {
            if (String(sorted[j].terminal ?? '') === 'Entrada Depo') { entrada = sorted[j]; break; }
          }
          if (entrada) {
            let diff = timeToSeconds(String(entrada.hora ?? '')) - timeToSeconds(String(salida.hora ?? ''));
            if (diff < 0) diff += 86400;
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
        jornada: String(first.jornada ?? ''),
        sector: String(first.sector ?? ''),
        empresa: String(first.empresa ?? ''),
        tiemposFuera, totalFueraSegundos, totalFuera: secondsToTime(totalFueraSegundos),
        comidasHoras, facialRegistros,
      });
    }

    employees.sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return a.nombre.localeCompare(b.nombre);
    });

    const uniqueEmployees = new Set(employees.map(e => e.codigoEmp));
    const totalOutsideTime = employees.reduce((sum, e) => sum + e.totalFueraSegundos, 0);

    return NextResponse.json({
      employees,
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