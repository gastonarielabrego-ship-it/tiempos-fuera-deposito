'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Upload, RefreshCw, Clock, Users, UtensilsCrossed, ScanFace,
  FileSpreadsheet, Search, Sun, Sunset, Moon, Download,
  ArrowUpFromLine, ArrowDownToLine, ChevronDown, AlertTriangle,
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

interface Summary {
  totalEmployees: number; totalRecords: number; totalComidas: number;
  totalFacial: number; avgOutsidePerEmployee: string; dates: string[];
}

interface DashboardData {
  employees: EmployeeDay[]; ranking: RankingEntry[];
  rankingPorTurno: TurnoRanking[]; turnos: string[]; summary: Summary;
}

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
  OTRO: { label: 'Sin clasificar', icon: Clock, bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
};

/* ═══════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════ */

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [tab, setTab] = useState<'ranking' | 'turno'>('ranking');
  const [search, setSearch] = useState('');
  const [filterTurno, setFilterTurno] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [profileEmp, setProfileEmp] = useState<EmployeeDay | null>(null);
  const [profileDateIdx, setProfileDateIdx] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch('/api/dashboard'); if (r.ok) setData(await r.json()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetch(); }, [fetch]);

  const upload = async (ep: string, file: File) => {
    setUploading(ep);
    const fd = new FormData(); fd.append('file', file);
    try { const r = await fetch(ep, { method: 'POST', body: fd }); if (r.ok) fetch(); }
    catch (e) { console.error(e); }
    finally { setUploading(null); setShowUpload(false); }
  };

  /* ── Derived data ── */

  const filteredRanking = useMemo(() => {
    if (!data) return [];
    return data.ranking.filter(e => {
      const matchSearch = !search || e.nombre.toLowerCase().includes(search.toLowerCase()) || String(e.codigoEmp).includes(search);
      const matchTurno = filterTurno === 'all';
      return matchSearch && matchTurno;
    });
  }, [data, search, filterTurno]);

  const filteredTurnoCards = useMemo(() => {
    if (!data) return [];
    return data.rankingPorTurno.filter(tr => tr.empleados.length > 0);
  }, [data]);

  // Profile
  const empDays = useMemo(() => {
    if (!profileEmp || !data) return [];
    return data.employees
      .filter(e => e.codigoEmp === profileEmp.codigoEmp)
      .filter(e => filterDate === 'all' || e.fecha === filterDate)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [profileEmp, data, filterDate]);

  const profileDay = empDays[profileDateIdx] || null;

  const openProfile = (codigo: number) => {
    if (!data) return;
    const emp = data.employees.find(e => e.codigoEmp === codigo);
    if (emp) { setProfileEmp(emp); setProfileDateIdx(0); }
  };

  const totalFueraAll = data?.ranking.reduce((s, e) => s + e.totalFueraSegundos, 0) || 0;
  const maxFuera = data?.ranking[0];
  const totalEventos = data?.employees.reduce((s, e) => s + e.tiemposFuera.length, 0) || 0;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ═══════════ HEADER ═══════════ */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">Tiempos Fuera de Deposito</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input placeholder="Buscar operador..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 w-52 text-sm border-gray-300" />
            </div>
            <select value={filterTurno} onChange={e => setFilterTurno(e.target.value)}
              className="h-8 text-sm border border-gray-300 rounded-md px-2.5 bg-white text-gray-600 focus:outline-none">
              <option value="all">Turno: Todos</option>
              {data?.turnos.map(t => <option key={t} value={t}>{t} — {turnoMeta[t]?.label || t}</option>)}
            </select>
            <select value={filterDate} onChange={e => setFilterDate(e.target.value)}
              className="h-8 text-sm border border-gray-300 rounded-md px-2.5 bg-white text-gray-600 focus:outline-none">
              <option value="all">Fecha: Todas</option>
              {data?.summary.dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="relative">
              <Button variant="outline" size="sm" className="h-8 text-sm border-gray-300 text-gray-600"
                onClick={() => setShowUpload(!showUpload)}>
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Cargar Excel
              </Button>
              {showUpload && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 space-y-2">
                  {[
                    { label: 'Accesos', ep: '/api/upload-accesos' },
                    { label: 'Comidas (TK)', ep: '/api/upload-comidas' },
                    { label: 'Facial', ep: '/api/upload-facial' },
                  ].map(({ label, ep }) => (
                    <label key={ep}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors hover:bg-gray-50 ${uploading === ep ? 'opacity-50' : ''}`}>
                      <input type="file" accept=".xlsx,.xls" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) upload(ep, f); e.target.value = ''; }} />
                      <FileSpreadsheet className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-700">{label}</span>
                    </label>
                  ))}
                  <p className="text-[10px] text-gray-400 px-1">Se sobreescribe con cada carga</p>
                </div>
              )}
            </div>
            <Button size="sm" className="h-8 bg-red-500 hover:bg-red-600 text-white text-sm"
              onClick={fetch} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
            </Button>
          </div>
        </div>
      </header>

      {/* ═══════════ MAIN ═══════════ */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-5 space-y-4">

        {/* ── Metric Cards ── */}
        {data && !loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon={<Users className="h-5 w-5 text-blue-500" />}
              label="Total Empleados" value={String(data.summary.totalEmployees)}
              accent="border-l-blue-500"
            />
            <MetricCard
              icon={<Clock className="h-5 w-5 text-red-500" />}
              label="Suma Tiempos Fuera" value={formatHMS(totalFueraAll)}
              sub={`${totalEventos} eventos`}
              accent="border-l-red-500"
              subBg="bg-red-50"
            />
            <MetricCard
              icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
              label="Promedio por Empleado" value={data.summary.avgOutsidePerEmployee}
              accent="border-l-amber-500"
            />
            <MetricCard
              icon={<Clock className="h-5 w-5 text-orange-500" />}
              label="Mayor Tiempo Fuera"
              value={maxFuera ? maxFuera.totalFuera : '00:00:00'}
              sub={maxFuera ? maxFuera.nombre : ''}
              accent="border-l-orange-500"
            />
          </div>
        )}

        {/* ── Summary bar ── */}
        {data && !loading && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 flex items-center gap-6">
            <div className="flex items-center gap-1.5 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Resumen</span>
            </div>
            <span className="text-sm"><b className="text-red-600">{totalEventos}</b> <span className="text-gray-500">salidas</span></span>
            <span className="text-sm"><b className="text-red-600">{formatHMS(totalFueraAll)}</b> <span className="text-gray-500">suma total</span></span>
            <span className="text-sm"><b className="text-red-600">{data.summary.totalEmployees}</b> <span className="text-gray-500">empleados</span></span>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>}

        {/* ── Empty ── */}
        {!loading && data && data.employees.length === 0 && (
          <div className="text-center py-24">
            <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-200 mb-4" />
            <p className="text-gray-400 text-sm">Carga los archivos Excel para comenzar</p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TABS: RANKING / POR TURNO
            ══════════════════════════════════════════════════ */}
        {data && !loading && data.employees.length > 0 && (
          <div className="space-y-4">
            {/* Tab bar */}
            <div className="flex items-center gap-6 border-b border-gray-200">
              <button onClick={() => setTab('ranking')}
                className={`pb-2.5 text-sm font-medium transition-colors ${tab === 'ranking' ? 'text-red-600 border-b-2 border-red-500' : 'text-gray-500 hover:text-gray-700'}`}>
                Ranking
              </button>
              <button onClick={() => setTab('turno')}
                className={`pb-2.5 text-sm font-medium transition-colors ${tab === 'turno' ? 'text-red-600 border-b-2 border-red-500' : 'text-gray-500 hover:text-gray-700'}`}>
                Por Turno
              </button>
            </div>

            {/* ══════ RANKING TAB ══════ */}
            {tab === 'ranking' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-gray-800">Ranking por Tiempo Fuera de Deposito</h2>
                  <span className="text-xs text-gray-400">{filteredRanking.length} operadores</span>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 w-12">#</th>
                        <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Operador</th>
                        <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 w-20">Turno</th>
                        <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-32">T. Fuera Deposito</th>
                        <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-24">Prom/Dia</th>
                        <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-20">Dias</th>
                        <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-24">Mayor Dia</th>
                        <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-16">Eventos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredRanking.map((emp, idx) => {
                        const pos = idx + 1;
                        const rankBadge = pos <= 3 ? 'bg-red-500' : pos <= 7 ? 'bg-orange-400' : '';
                        const rowBg = pos <= 3 ? 'bg-red-50/40' : '';

                        // Find the most common turno for this employee
                        const empTurno = data.employees.find(e => e.codigoEmp === emp.codigoEmp)?.turno || 'OTRO';
                        const tMeta = turnoMeta[empTurno] || turnoMeta.OTRO;
                        const TurnoIcon = tMeta.icon;

                        return (
                          <tr key={emp.codigoEmp} className={`${rowBg} hover:bg-gray-50 cursor-pointer transition-colors`}
                            onClick={() => openProfile(emp.codigoEmp)}>
                            <td className="px-3 py-3">
                              {rankBadge ? (
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${rankBadge}`}>
                                  {pos}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400 font-medium pl-1.5">{pos}</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-semibold text-gray-800 text-sm">{emp.nombre}</p>
                              <p className="text-[11px] text-gray-400">{emp.codigoEmp} &middot; {emp.empresa}</p>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${tMeta.bg} ${tMeta.text} ${tMeta.border}`}>
                                <TurnoIcon className="h-3 w-3" /> {empTurno}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className={`font-mono font-bold ${durTextColor(emp.totalFueraSegundos)}`}>
                                {emp.totalFuera}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="font-mono text-gray-600 text-xs">{emp.avgPorDia}</span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="text-gray-600 text-sm">{emp.diasCount}</span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="font-mono text-xs text-gray-600">{emp.maxDiaFuera}</span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="text-gray-600 text-sm">{emp.eventosCount}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ══════ POR TURNO TAB ══════ */}
            {tab === 'turno' && (
              <div>
                <h2 className="text-sm font-bold text-gray-800 mb-3">Por Turno</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {filteredTurnoCards.map(tr => {
                    const tm = turnoMeta[tr.turno] || turnoMeta.OTRO;
                    const TIcon = tm.icon;
                    return (
                      <div key={tr.turno} className={`rounded-xl border ${tm.border} ${tm.bg} p-5 cursor-pointer hover:shadow-md transition-shadow`}
                        onClick={() => { setFilterTurno(tr.turno); setTab('ranking'); }}>
                        <div className="flex items-center gap-2 mb-2">
                          <TIcon className={`h-5 w-5 ${tm.text}`} />
                          <span className={`text-sm font-bold ${tm.text}`}>{tr.turno}</span>
                          <span className="text-[10px] text-gray-400">{tm.label}</span>
                        </div>
                        <p className={`text-2xl font-black font-mono ${tm.text}`}>{tr.totalFuera}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {tr.eventosCount} eventos &middot; {formatHMS(tr.totalFueraSegundos)}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">{tr.empleados.length} operadores</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ═══════════ PROFILE DIALOG ═══════════ */}
      <Dialog open={profileEmp !== null} onOpenChange={o => { if (!o) setProfileEmp(null); }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
          {profileEmp && (
            <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-base font-bold text-gray-800">
                    OPERADOR: {profileEmp.nombre}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-gray-400 mt-0.5">
                    Codigo {profileEmp.codigoEmp} &middot; {profileEmp.empresa} &middot; {profileEmp.sector}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {empDays.reduce((s, d) => s + d.tiemposFuera.length, 0)} salidas
                  </span>
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                    (turnoMeta[profileEmp.turno] || turnoMeta.OTRO).bg
                  } ${(turnoMeta[profileEmp.turno] || turnoMeta.OTRO).text}`}>
                    {(() => { const TIcon = (turnoMeta[profileEmp.turno] || turnoMeta.OTRO).icon; return <TIcon className="h-3 w-3" />; })()}
                    {profileEmp.turno}
                  </span>
                </div>
              </div>

              {/* Date tabs */}
              <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
                {empDays.map((d, i) => (
                  <button key={d.fecha} onClick={() => setProfileDateIdx(i)}
                    className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${profileDateIdx === i
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {d.fecha}
                    {d.totalFueraSegundos > 0 && <span className="ml-1 opacity-70">({d.totalFuera})</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {profileDay && (
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-5">
                {/* Day summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-gray-400 uppercase">Jornada</p>
                    <p className="text-sm font-semibold text-gray-700 mt-0.5">{profileDay.jornada || '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-gray-400 uppercase">Total Fuera</p>
                    <p className={`text-sm font-bold font-mono mt-0.5 ${durTextColor(profileDay.totalFueraSegundos)}`}>
                      {profileDay.totalFuera}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-gray-400 uppercase">Salidas</p>
                    <p className="text-sm font-bold text-gray-700 mt-0.5">{profileDay.tiemposFuera.length}</p>
                  </div>
                </div>

                {/* Times table */}
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tiempos Fuera de Deposito</h3>
                  {profileDay.tiemposFuera.length === 0 ? (
                    <p className="text-sm text-gray-300 italic">Sin salidas registradas</p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left w-10">#</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-center">Salida</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-center">Entrada</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Duracion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {profileDay.tiemposFuera.map((t, i) => (
                            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-red-500 text-white text-[10px] font-bold">
                                  {i + 1}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className="font-mono text-xs text-red-500 font-medium">{t.salida}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className="font-mono text-xs text-emerald-600 font-medium">{t.entrada}</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={`inline-block px-2 py-0.5 rounded font-mono text-xs font-bold ${durTextColor(t.duracionSegundos)}`}>
                                  {t.duracion}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {profileDay.tiemposFuera.length > 1 && (
                            <tr className="bg-red-50">
                              <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-red-700">Total</td>
                              <td className="px-3 py-2 text-right">
                                <span className="font-mono text-xs font-black text-red-600">{profileDay.totalFuera}</span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Linea de Tiempo</h3>
                  <Timeline day={profileDay} />
                </div>

                {/* Comidas */}
                {profileDay.comidasHoras.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">TK Comida</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profileDay.comidasHoras.map((h, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-600 px-2.5 py-1 rounded-full border border-orange-200">
                          <UtensilsCrossed className="h-3 w-3" /> {h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Facial */}
                {profileDay.facialRegistros.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Registros Faciales</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profileDay.facialRegistros.map((f, i) => (
                        <span key={i} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${
                          f.zona.toLowerCase().includes('entrada')
                            ? 'bg-blue-50 text-blue-600 border-blue-200'
                            : 'bg-purple-50 text-purple-600 border-purple-200'
                        }`}>
                          <ScanFace className="h-3 w-3" /> {f.hora} — {f.zona}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════ */

function MetricCard({ icon, label, value, sub, accent, subBg }: {
  icon: React.ReactNode; label: string; value: string;
  sub?: string; accent: string; subBg?: string;
}) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 border-l-4 ${accent}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        {icon}
      </div>
      <p className="text-xl font-black text-gray-800">{value}</p>
      {sub && (
        <p className={`text-[11px] mt-1 ${subBg || ''} px-1.5 py-0.5 rounded inline-block ${subBg ? 'text-gray-500' : 'text-gray-400'}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

function Timeline({ day }: { day: EmployeeDay }) {
  const events = useMemo(() => {
    const list: { hora: string; seg: number; tipo: 'entrada' | 'salida' | 'facial' | 'comida'; label: string }[] = [];
    for (const ev of day.accesosEventos) {
      const seg = timeToS(ev.hora);
      if (ev.terminal === 'Entrada Depo') list.push({ hora: ev.hora, seg, tipo: 'entrada', label: 'Entrada Depo' });
      else if (ev.terminal === 'Salida Depo') list.push({ hora: ev.hora, seg, tipo: 'salida', label: 'Salida Depo' });
    }
    for (const f of day.facialRegistros) list.push({ hora: f.hora, seg: timeToS(f.hora), tipo: 'facial', label: f.zona || 'Facial' });
    for (const h of day.comidasHoras) list.push({ hora: h, seg: timeToS(h), tipo: 'comida', label: 'TK Comida' });
    return list.sort((a, b) => a.seg - b.seg);
  }, [day]);

  if (events.length === 0) return <p className="text-xs text-gray-300 italic py-2">Sin eventos</p>;

  const minSeg = Math.max(0, Math.floor(events[0].seg / 3600) * 3600 - 3600);
  const maxSeg = Math.min(86400, Math.ceil(events[events.length - 1].seg / 3600) * 3600 + 3600);
  const range = maxSeg - minSeg || 1;
  const pct = (seg: number) => ((seg - minSeg) / range) * 100;

  const bands = day.tiemposFuera.map(t => ({
    left: pct(timeToS(t.salida)),
    width: Math.min(((timeToS(t.entrada) - timeToS(t.salida) + (timeToS(t.entrada) < timeToS(t.salida) ? 86400 : 0)) / range) * 100, 100),
  }));

  const styles: Record<string, { bg: string }> = {
    entrada: { bg: 'bg-emerald-500' },
    salida: { bg: 'bg-red-500' },
    facial: { bg: 'bg-blue-500' },
    comida: { bg: 'bg-orange-500' },
  };

  return (
    <div className="space-y-1.5">
      <div className="relative h-10 bg-gray-100 rounded-lg border border-gray-200">
        {bands.map((b, i) => (
          <div key={i} className="absolute top-0 bottom-0 bg-red-100/70 rounded" style={{ left: `${b.left}%`, width: `${b.width}%` }} />
        ))}
        {events.map((ev, i) => (
          <div key={i} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group" style={{ left: `${pct(ev.seg)}%` }}>
            <div className={`w-5 h-5 ${styles[ev.tipo]?.bg || 'bg-gray-400'} rounded-full flex items-center justify-center text-white shadow-sm hover:scale-125 transition-transform cursor-default`}>
              {ev.tipo === 'entrada' && <ArrowDownToLine className="h-2.5 w-2.5" />}
              {ev.tipo === 'salida' && <ArrowUpFromLine className="h-2.5 w-2.5" />}
              {ev.tipo === 'facial' && <ScanFace className="h-2.5 w-2.5" />}
              {ev.tipo === 'comida' && <UtensilsCrossed className="h-2.5 w-2.5" />}
            </div>
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded text-[9px] bg-gray-900 text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {ev.hora} — {ev.label}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Entrada</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Salida</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Facial</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> TK</span>
        <span className="flex items-center gap-1"><span className="w-2 h-1 rounded bg-red-200 border border-red-300" /> Fuera</span>
      </div>
    </div>
  );
}