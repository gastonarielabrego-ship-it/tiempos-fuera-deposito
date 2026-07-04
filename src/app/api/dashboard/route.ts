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
    // 1. Get all access records
    const accesos = await db.accessRecord.findMany({
      orderBy: [{ fecha: 'asc' }, { nombre: 'asc' }, { hora: 'asc' }],
    });

    if (accesos.length === 0) {
      return NextResponse.json({ employees: [], dates: [], summary: { totalEmployees: 0, totalRecords: 0 } });
    }

    // 2. Get all meal records grouped by nombre + fecha
    const comidas = await db.mealRecord.findMany({
      orderBy: [{ fecha: 'asc' }, { nombre: 'asc' }, { hora: 'asc' }],
    });

    // 3. Get all facial records grouped by persona + fecha
    const facial = await db.facialRecord.findMany({
      orderBy: [{ fecha: 'asc' }, { persona: 'asc' }, { hora: 'asc' }],
    });

    // Build meal lookup: key = "NOMBRE|fecha" -> array of horas
    const mealMap = new Map<string, string[]>();
    for (const c of comidas) {
      const key = `${c.nombre.toUpperCase()}|${c.fecha}`;
      if (!mealMap.has(key)) mealMap.set(key, []);
      mealMap.get(key)!.push(c.hora);
    }

    // Build facial lookup: key = "NOMBRE|fecha" -> array of { hora, zona }
    const facialMap = new Map<string, { hora: string; zona: string }[]>();
    for (const f of facial) {
      const key = `${f.persona.toUpperCase()}|${f.fecha}`;
      if (!facialMap.has(key)) facialMap.set(key, []);
      facialMap.get(key)!.push({ hora: f.hora, zona: f.zona });
    }

    // 4. Process access records: pair Salida -> Entrada to get "tiempos fuera de depósito"
    // Group by (codigoEmp, fecha)
    const grouped = new Map<string, typeof accesos>();
    for (const a of accesos) {
      const key = `${a.codigoEmp}|${a.fecha}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(a);
    }

    // Get unique dates
    const dateSet = new Set<string>();
    for (const a of accesos) dateSet.add(a.fecha);
    const dates = Array.from(dateSet).sort();

    interface TimeOutPair {
      salida: string;
      entrada: string;
      duracionSegundos: number;
      duracion: string;
    }

    interface EmployeeDay {
      codigoEmp: number;
      nombre: string;
      fecha: string;
      jornada: string;
      sector: string;
      empresa: string;
      tiemposFuera: TimeOutPair[];
      totalFueraSegundos: number;
      totalFuera: string;
      comidasHoras: string[];
      facialRegistros: { hora: string; zona: string }[];
    }

    const employees: EmployeeDay[] = [];

    for (const [, records] of grouped) {
      if (records.length === 0) continue;

      // Sort by hora
      const sorted = [...records].sort((a, b) => timeToSeconds(a.hora) - timeToSeconds(b.hora));

      const first = sorted[0];
      const nombreKey = `${first.nombre.toUpperCase()}|${first.fecha}`;
      const comidasHoras = mealMap.get(nombreKey) || [];
      const facialRegistros = facialMap.get(nombreKey) || [];

      // Pair: find each Salida and its next Entrada = time outside
      const tiemposFuera: TimeOutPair[] = [];
      let i = 0;
      while (i < sorted.length) {
        if (sorted[i].terminal === 'Salida Depo') {
          const salida = sorted[i];
          // Find next Entrada after this Salida
          let entrada = null;
          for (let j = i + 1; j < sorted.length; j++) {
            if (sorted[j].terminal === 'Entrada Depo') {
              entrada = sorted[j];
              break;
            }
          }
          if (entrada) {
            const salidaSec = timeToSeconds(salida.hora);
            const entradaSec = timeToSeconds(entrada.hora);
            let diff = entradaSec - salidaSec;
            if (diff < 0) diff += 86400; // midnight crossover
            tiemposFuera.push({
              salida: salida.hora,
              entrada: entrada.hora,
              duracionSegundos: diff,
              duracion: secondsToTime(diff),
            });
          }
        }
        i++;
      }

      const totalFueraSegundos = tiemposFuera.reduce((sum, t) => sum + t.duracionSegundos, 0);

      employees.push({
        codigoEmp: first.codigoEmp,
        nombre: first.nombre,
        fecha: first.fecha,
        jornada: first.jornada,
        sector: first.sector,
        empresa: first.empresa,
        tiemposFuera,
        totalFueraSegundos,
        totalFuera: secondsToTime(totalFueraSegundos),
        comidasHoras,
        facialRegistros,
      });
    }

    // Sort by fecha desc, then nombre asc
    employees.sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return a.nombre.localeCompare(b.nombre);
    });

    // Summary stats
    const uniqueEmployees = new Set(employees.map(e => e.codigoEmp));
    const totalOutsideTime = employees.reduce((sum, e) => sum + e.totalFueraSegundos, 0);

    const summary = {
      totalEmployees: uniqueEmployees.size,
      totalRecords: accesos.length,
      totalComidas: comidas.length,
      totalFacial: facial.length,
      avgOutsidePerEmployee: employees.length > 0
        ? secondsToTime(Math.round(totalOutsideTime / uniqueEmployees.size))
        : '00:00:00',
      dates,
    };

    return NextResponse.json({ employees, summary });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return NextResponse.json({ error: 'Error obteniendo datos del dashboard' }, { status: 500 });
  }
}