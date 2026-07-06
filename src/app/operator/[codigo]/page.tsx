'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, ArrowUpFromLine, ArrowDownToLine, ScanFace,
  UtensilsCrossed, Clock, Sun, Sunset, Moon, AlertTriangle,
} from 'lucide-react';

/* ═══════════════════════════════════════
   TYPES
   ═══════════════════════════════════════ */

interface TimeOutPair { salida: string; entrada: string; duracionSegundos: number; duracion: string; }
interface AccesoEvento { hora: string; terminal: string; }

interface EmployeeDay {
  codigoEmp: number; nombre: string; fecha: string; jornada: string; sector: string; empresa: string;
  turno: string; tiemposFuera: TimeOutPair[]; totalFueraSegundos: number; totalFuera: string;
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
interface Summary { totalEmployees: number; totalRecords: number; totalComidas: number; totalFacial: number; avgOutsidePerEmployee: string; dates: string[]; }
interface DashboardData { employees: EmployeeDay[]; ranking: RankingEntry[]; rankingPorTurno: TurnoRanking[]; turnos: string[]; summary: Summary; }

/* ═══════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════ */

const timeToS = (t: string) => {
  if (!t) return 0;
  const p = t.split(':');
  return (Number(p[0]) || 0) * 3600 + (Number(p[1]) || 0) * 60 + (Number(p[2]) || 0);
};

const formatHMS = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
};

const durTextColor = (s: number) => s <= 1800 ? 'text-emerald-600' : s <= 3600 ? 'text-amber-600' : 'text-red-600';

const turnoMeta: Record<string, { label: string; icon: typeof Sun; bg: string; text: string; border: string }> = {
  TM: { label: 'Mañana', icon: Sun, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  TT: { label: 'Tarde', icon: Sunset, bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  TN: { label: 'Noche', icon: Moon, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
};
const DEFAULT_TURNO_META = { label: '—', icon: Clock, bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200' };

/* ═══════════════════════════════════════
   UNIFIED MOVEMENT TABLE
   ═══════════════════════════════════════ */

interface UnifiedEvent {
  hora: string; seg: number; tipo: 'entrada' | 'salida' | 'facial' | 'comida' | 'otro';
  label: string; duracion?: string; duracionSeg?: number;
}

function UnifiedMovements({ day }: { day: EmployeeDay }) {
  const events = useMemo(() => {
    const list: UnifiedEvent[] = [];

    for (const ev of day.accesosEventos) {
      const seg = timeToS(ev.hora);
      if (ev.terminal === 'Entrada Depo') {
        const paired = day.tiemposFuera.find(t => t.entrada === ev.hora);
        list.push({
          hora: ev.hora, seg, tipo: 'entrada', label: 'Entrada Depo',
          duracion: paired?.duracion, duracionSeg: paired?.duracionSegundos,
        });
      } else if (ev.terminal === 'Salida Depo') {
        list.push({ hora: ev.hora, seg, tipo: 'salida', label: 'Salida Depo' });
      } else {
        list.push({ hora: ev.hora, seg, tipo: 'otro', label: ev.terminal });
      }
    }

    for (const f of day.facialRegistros) {
      list.push({ hora: f.hora, seg: timeToS(f.hora), tipo: 'facial', label: f.zona || 'Facial' });
    }

    for (const h of day.comidasHoras) {
      list.push({ hora: h, seg: timeToS(h), tipo: 'comida', label: 'TK Comida' });
    }

    return list.sort((a, b) => a.seg - b.seg);
  }, [day]);

  if (events.length === 0) return <p className="text-sm text-gray-300 italic py-4">Sin movimientos registrados</p>;

  const styleMap: Record<string, { bg: string; icon: typeof ArrowDownToLine }> = {
    entrada: { bg: 'bg-emerald-100 text-emerald-700', icon: ArrowDownToLine },
    salida:  { bg: 'bg-red-100 text-red-700', icon: ArrowUpFromLine },
    facial:  { bg: 'bg-blue-100 text-blue-700', icon: ScanFace },
    comida:  { bg: 'bg-orange-100 text-orange-700', icon: UtensilsCrossed },
    otro:    { bg: 'bg-gray-100 text-gray-600', icon: Clock },
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-left w-12">#</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center w-24">Hora</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-left">Evento</th>
            <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-32">Tiempo Fuera</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {events.map((ev, i) => {
            const s = styleMap[ev.tipo] || styleMap.otro;
            const Icon = s.icon;
            return (
              <tr key={i} className={ev.tipo === 'salida' ? 'bg-red-50/30' : ev.tipo === 'entrada' ? 'bg-emerald-50/30' : ''}>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-200 text-gray-600 text-[10px] font-bold">{i + 1}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="font-mono text-sm font-medium text-gray-700">{ev.hora}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.bg}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {ev.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {ev.duracion ? (
                    <span className={`inline-block px-2.5 py-1 rounded font-mono text-xs font-bold ${durTextColor(ev.duracionSeg ?? 0)}`}>
                      {ev.duracion}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════
   PAGE
   ═══════════════════════════════════════ */

export default function OperatorPage() {
  const params = useParams();
  const codigo = Number(params.codigo);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [fechaFilter, setFechaFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await window.fetch('/api/dashboard');
      if (r.ok) {
        const json = await r.json();
        if (json.error) { setError(json.error); return; }
        setData(json);
      } else {
        const text = await r.text().catch(() => 'Error desconocido');
        setError(`Error del servidor (${r.status}): ${text}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Employee days for this operator
  const empDays = useMemo(() => {
    if (!data) return [];
    return data.employees
      .filter(e => e.codigoEmp === codigo)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [data, codigo]);

  // Get operator info
  const emp = empDays[0] || null;
  const rankingEntry = data?.ranking.find(r => r.codigoEmp === codigo);

  // Filtered days by fechaFilter
  const filteredDays = useMemo(() => {
    if (!fechaFilter) return selectedDate ? empDays.filter(d => d.fecha === selectedDate) : empDays;
    const target = fechaFilter || selectedDate;
    return empDays.filter(d => d.fecha === target);
  }, [empDays, selectedDate, fechaFilter]);

  // All unique dates
  const allDates = useMemo(() => {
    const dates = new Set(empDays.map(d => d.fecha));
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [empDays]);

  // Totals
  const totalFuera = empDays.reduce((s, d) => s + d.totalFueraSegundos, 0);
  const totalEventos = empDays.reduce((s, d) => s + d.tiemposFuera.length, 0);
  const totalFacial = empDays.reduce((s, d) => s + d.facialRegistros.length, 0);
  const totalComidas = empDays.reduce((s, d) => s + d.comidasHoras.length, 0);

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-white p-6 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-12 w-full mb-4" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full mt-6" />
      </div>
    );
  }

  /* ── Error ── */
  if (error || !data) {
    return (
      <div className="min-h-screen bg-white p-6 max-w-6xl mx-auto">
        <button onClick={() => window.location.href = '/'} className="text-sm text-blue-600 hover:underline mb-6 inline-flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Volver al ranking
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-sm font-semibold text-red-700">Error al cargar datos</p>
          <p className="text-xs text-red-500 mt-1">{error || 'No se encontraron datos'}</p>
        </div>
      </div>
    );
  }

  /* ── Not found ── */
  if (!emp) {
    return (
      <div className="min-h-screen bg-white p-6 max-w-6xl mx-auto">
        <button onClick={() => window.location.href = '/'} className="text-sm text-blue-600 hover:underline mb-6 inline-flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Volver al ranking
        </button>
        <div className="text-center py-20">
          <p className="text-gray-400 text-base">Operador #{codigo} no encontrado</p>
        </div>
      </div>
    );
  }

  const tMeta = turnoMeta[emp.turno] || DEFAULT_TURNO_META;
  const TurnoIcon = tMeta.icon;

  return (
    <div className="min-h-screen bg-white">
      {/* ═══════════ HEADER ═══════════ */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <button onClick={() => window.location.href = '/'} className="text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1.5 shrink-0">
            <ArrowLeft className="h-4 w-4" /> Volver al ranking
          </button>
          <h1 className="text-sm sm:text-base font-bold text-gray-800 truncate">
            Perfil de Operador
          </h1>
          <div className="w-20" /> {/* spacer */}
        </div>
      </header>

      {/* ═══════════ MAIN ═══════════ */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Operator info ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-gray-800">{emp.nombre}</h2>
              <p className="text-sm text-gray-500 mt-1">
                Codigo {emp.codigoEmp} &middot; {emp.empresa} &middot; {emp.sector}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full border self-start ${tMeta.bg} ${tMeta.text} ${tMeta.border}`}>
              <TurnoIcon className="h-4 w-4" /> {emp.turno} — {tMeta.label}
            </span>
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-4 border-l-4 border-l-red-500">
            <p className="text-[10px] text-gray-500 font-medium uppercase">Total Fuera Deposito</p>
            <p className={`text-lg font-black font-mono mt-1 ${durTextColor(totalFuera)}`}>{formatHMS(totalFuera)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 border-l-4 border-l-amber-500">
            <p className="text-[10px] text-gray-500 font-medium uppercase">Eventos Fuera</p>
            <p className="text-lg font-black text-gray-800 mt-1">{totalEventos}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 border-l-4 border-l-blue-500">
            <p className="text-[10px] text-gray-500 font-medium uppercase">Registros Faciales</p>
            <p className="text-lg font-black text-gray-800 mt-1">{totalFacial}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 border-l-4 border-l-orange-500">
            <p className="text-[10px] text-gray-500 font-medium uppercase">TK Comida</p>
            <p className="text-lg font-black text-gray-800 mt-1">{totalComidas}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 border-l-4 border-l-gray-400">
            <p className="text-[10px] text-gray-500 font-medium uppercase">Dias</p>
            <p className="text-lg font-black text-gray-800 mt-1">{empDays.length}</p>
            {rankingEntry && (
              <p className="text-[10px] text-gray-400 mt-0.5">Prom/dia: {rankingEntry.avgPorDia}</p>
            )}
          </div>
        </div>

        {/* ── Date filter ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <input type="date" value={fechaFilter}
              onChange={e => { setFechaFilter(e.target.value); setSelectedDate(null); }}
              className="h-8 text-xs border border-gray-300 rounded px-2 bg-white" />
            {fechaFilter && <button onClick={() => setFechaFilter('')} className="text-xs text-gray-400 hover:text-gray-600">✕ Limpiar</button>}
          </div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filtrar por fecha:</span>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setSelectedDate(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedDate === null ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Todas ({empDays.length})
            </button>
            {allDates.map(d => {
              const dayData = empDays.find(ed => ed.fecha === d);
              return (
                <button key={d} onClick={() => setSelectedDate(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${selectedDate === d ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {d}
                  {dayData && dayData.totalFueraSegundos > 0 && (
                    <span className="ml-1 opacity-70">({dayData.totalFuera})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Days with movements ── */}
        {filteredDays.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-10">No hay datos para esta fecha</p>
        ) : (
          <div className="space-y-6">
            {filteredDays.map((day) => (
              <div key={day.fecha} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Day header */}
                <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-gray-700">{day.fecha}</h3>
                    <span className="text-xs text-gray-400">Jornada: {day.jornada || '—'}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">
                      {day.accesosEventos.length} accesos &middot; {day.facialRegistros.length} faciales &middot; {day.comidasHoras.length} comidas
                    </span>
                    {day.totalFueraSegundos > 0 && (
                      <span className={`text-sm font-bold font-mono ${durTextColor(day.totalFueraSegundos)}`}>
                        {day.totalFuera} fuera
                      </span>
                    )}
                  </div>
                </div>

                {/* Movements table */}
                <div className="p-4">
                  <UnifiedMovements day={day} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}