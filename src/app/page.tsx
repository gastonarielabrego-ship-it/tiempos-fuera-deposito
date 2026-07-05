'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import {
  Upload, RefreshCw, Clock, Users,
  FileSpreadsheet, Search, Sun, Sunset, Moon,
  AlertTriangle, CheckCircle2, XCircle,
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
};

const DEFAULT_TURNO_META = { label: '—', icon: Clock, bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200' };

/* ═══════════════════════════════════════
   TOAST NOTIFICATION
   ═══════════════════════════════════════ */

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const Icon = type === 'success' ? CheckCircle2 : XCircle;
  const bg = type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700';
  return (
    <div className={`fixed bottom-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm font-medium animate-in slide-in-from-bottom-2 ${bg}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 opacity-50 hover:opacity-100"><XCircle className="h-3.5 w-3.5" /></button>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════ */

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTurno, setFilterTurno] = useState('all');
  const [showUpload, setShowUpload] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await window.fetch('/api/dashboard');
      if (r.ok) {
        const json = await r.json();
        setData(json);
        if (json.error) setError(json.error);
      } else {
        const text = await r.text().catch(() => 'Error desconocido');
        setError(`Error del servidor (${r.status}): ${text}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error de conexión';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const upload = async (ep: string, label: string, file: File) => {
    setUploading(ep);
    setShowUpload(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await window.fetch(ep, { method: 'POST', body: fd });
      if (r.ok) {
        const json = await r.json().catch(() => null);
        showToast(`${label}: ${json?.count ?? 0} registros cargados`, 'success');
        await fetchData();
      } else {
        const text = await r.text().catch(() => 'Error desconocido');
        showToast(`${label}: ${text}`, 'error');
      }
    } catch (e) {
      showToast(`${label}: Error de conexión`, 'error');
    } finally {
      setUploading(null);
    }
  };

  const triggerFileInput = (ep: string) => {
    fileInputsRef.current[ep]?.click();
  };

  /* ── Derived data ── */

  // Build map: codigoEmp -> primary turno (most frequent turno across all their days)
  const empTurnoMap = useMemo(() => {
    if (!data) return new Map<number, string>();
    const map = new Map<number, Map<string, number>>();
    for (const ed of data.employees) {
      if (!map.has(ed.codigoEmp)) map.set(ed.codigoEmp, new Map());
      const turnoCounts = map.get(ed.codigoEmp)!;
      turnoCounts.set(ed.turno, (turnoCounts.get(ed.turno) || 0) + 1);
    }
    const result = new Map<number, string>();
    for (const [codigo, turnoCounts] of map) {
      let best = 'OTRO', bestCount = 0;
      for (const [t, c] of turnoCounts) { if (c > bestCount) { best = t; bestCount = c; } }
      result.set(codigo, best);
    }
    return result;
  }, [data]);

  const filteredRanking = useMemo(() => {
    if (!data) return [];
    return data.ranking.filter(e => {
      const matchSearch = !search || e.nombre.toLowerCase().includes(search.toLowerCase()) || String(e.codigoEmp).includes(search);
      const empTurno = empTurnoMap.get(e.codigoEmp) || 'OTRO';
      const matchTurno = filterTurno === 'all' || empTurno === filterTurno;
      return matchSearch && matchTurno;
    });
  }, [data, search, filterTurno, empTurnoMap]);

  const filteredTurnoCards = useMemo(() => {
    if (!data) return [];
    return data.rankingPorTurno.filter(tr => tr.empleados.length > 0);
  }, [data]);

  const openProfile = (codigo: number) => {
    window.location.href = `/operator/${codigo}`;
  };

  const totalFueraAll = data?.ranking.reduce((s, e) => s + e.totalFueraSegundos, 0) || 0;
  const maxFuera = data?.ranking[0];
  const totalEventos = data?.employees.reduce((s, e) => s + e.tiemposFuera.length, 0) || 0;

  const hasData = data && data.employees.length > 0;
  const isEmpty = data && data.employees.length === 0 && !error;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ═══════════ HEADER ═══════════ */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <h1 className="text-base sm:text-lg font-bold text-gray-800 whitespace-nowrap">Tiempos Fuera de Deposito</h1>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input placeholder="Buscar operador..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 w-40 sm:w-52 text-sm border-gray-300" />
            </div>
            <select value={filterTurno} onChange={e => setFilterTurno(e.target.value)}
              className="h-8 text-sm border border-gray-300 rounded-md px-2 bg-white text-gray-600 focus:outline-none">
              <option value="all">Turno: Todos</option>
              {data?.turnos.map(t => <option key={t} value={t}>{t} — {turnoMeta[t]?.label || t}</option>)}
            </select>
            <Button variant="outline" size="sm" className="h-8 text-sm border-gray-300 text-gray-600"
              onClick={() => setShowUpload(!showUpload)}>
              <Upload className="h-3.5 w-3.5 mr-1" /> Cargar
            </Button>
            <Button size="sm" className="h-8 bg-red-500 hover:bg-red-600 text-white text-sm"
              onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualizar
            </Button>
          </div>
        </div>

        {/* Upload dropdown */}
        {showUpload && (
          <div className="border-t border-gray-100 bg-gray-50 px-4 sm:px-6 py-3">
            <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-500 font-medium">Cargar archivo:</span>
              {[
                { label: 'Accesos', ep: '/api/upload-accesos' },
                { label: 'Comidas (TK)', ep: '/api/upload-comidas' },
                { label: 'Facial', ep: '/api/upload-facial' },
              ].map(({ label, ep }) => (
                <Button key={ep} variant="outline" size="sm" className="h-8 text-xs border-gray-300 text-gray-600"
                  disabled={uploading !== null}
                  onClick={() => triggerFileInput(ep)}>
                  {uploading === ep ? (
                    <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3 w-3 mr-1.5 text-gray-400" />
                  )}
                  {label}
                </Button>
              ))}
              <input
                key="/api/upload-accesos"
                ref={el => { fileInputsRef.current['/api/upload-accesos'] = el; }}
                type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) upload('/api/upload-accesos', 'Accesos', f); e.target.value = ''; }} />
              <input
                key="/api/upload-comidas"
                ref={el => { fileInputsRef.current['/api/upload-comidas'] = el; }}
                type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) upload('/api/upload-comidas', 'Comidas', f); e.target.value = ''; }} />
              <input
                key="/api/upload-facial"
                ref={el => { fileInputsRef.current['/api/upload-facial'] = el; }}
                type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) upload('/api/upload-facial', 'Facial', f); e.target.value = ''; }} />
              <span className="text-[10px] text-gray-400 ml-2">Se sobreescribe con cada carga</span>
            </div>
          </div>
        )}
      </header>

      {/* ═══════════ MAIN ═══════════ */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-4">

        {/* ── Error state ── */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">Error de conexión con la base de datos</p>
              <p className="text-xs text-red-500 mt-1">{error}</p>
              <p className="text-xs text-red-400 mt-2">Verificá que la variable DATABASE_URL esté configurada en Vercel.</p>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && !error && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {/* ── Empty state (no data yet) ── */}
        {isEmpty && (
          <div className="text-center py-20">
            <FileSpreadsheet className="h-16 w-16 mx-auto text-gray-200 mb-4" />
            <p className="text-gray-500 text-base font-medium">No hay datos cargados</p>
            <p className="text-gray-400 text-sm mt-1">Usá el botón &quot;Cargar&quot; de arriba para subir los archivos Excel</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => triggerFileInput('/api/upload-accesos')}
                className="text-sm">
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Cargar Accesos
              </Button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            CONTENT (has data)
            ══════════════════════════════════════ */}
        {hasData && !loading && (
          <>
            {/* ── Metric Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard icon={<Users className="h-5 w-5 text-blue-500" />} label="Total Empleados" value={String(data.summary.totalEmployees)} accent="border-l-blue-500" />
              <MetricCard icon={<Clock className="h-5 w-5 text-red-500" />} label="Suma Tiempos Fuera" value={formatHMS(totalFueraAll)} sub={`${totalEventos} eventos`} accent="border-l-red-500" subBg="bg-red-50" />
              <MetricCard icon={<AlertTriangle className="h-5 w-5 text-amber-500" />} label="Promedio por Empleado" value={data.summary.avgOutsidePerEmployee} accent="border-l-amber-500" />
              <MetricCard icon={<Clock className="h-5 w-5 text-orange-500" />} label="Mayor Tiempo Fuera" value={maxFuera ? maxFuera.totalFuera : '00:00:00'} sub={maxFuera ? maxFuera.nombre : ''} accent="border-l-orange-500" />
            </div>

            {/* ── Summary bar ── */}
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-2.5 flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-1.5 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Resumen</span>
              </div>
              <span className="text-sm"><b className="text-red-600">{totalEventos}</b> <span className="text-gray-500">salidas</span></span>
              <span className="text-sm"><b className="text-red-600">{formatHMS(totalFueraAll)}</b> <span className="text-gray-500">suma total</span></span>
              <span className="text-sm"><b className="text-red-600">{data.summary.totalEmployees}</b> <span className="text-gray-500">empleados</span></span>
            </div>

            {/* ── Ranking table ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-800">Ranking por Tiempo Fuera de Deposito</h2>
                <span className="text-xs text-gray-400">{filteredRanking.length} operadores</span>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
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
                        const empTurno = empTurnoMap.get(emp.codigoEmp) || '';
                        const tMeta = turnoMeta[empTurno] || DEFAULT_TURNO_META;
                        const TurnoIcon = tMeta.icon;

                        return (
                          <tr key={emp.codigoEmp} className={`${rowBg} hover:bg-gray-50 cursor-pointer transition-colors`}
                            onClick={() => openProfile(emp.codigoEmp)}>
                            <td className="px-3 py-3">
                              {rankBadge ? (
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${rankBadge}`}>{pos}</span>
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
                              <span className={`font-mono font-bold ${durTextColor(emp.totalFueraSegundos)}`}>{emp.totalFuera}</span>
                            </td>
                            <td className="px-3 py-3 text-right"><span className="font-mono text-gray-600 text-xs">{emp.avgPorDia}</span></td>
                            <td className="px-3 py-3 text-right"><span className="text-gray-600 text-sm">{emp.diasCount}</span></td>
                            <td className="px-3 py-3 text-right"><span className="font-mono text-xs text-gray-600">{emp.maxDiaFuera}</span></td>
                            <td className="px-3 py-3 text-right"><span className="text-gray-600 text-sm">{emp.eventosCount}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── Por Turno cards ── */}
            {filteredTurnoCards.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-800 mb-3">Por Turno</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {filteredTurnoCards.map(tr => {
                    const tm = turnoMeta[tr.turno] || DEFAULT_TURNO_META;
                    const TIcon = tm.icon;
                    return (
                      <div key={tr.turno} className={`rounded-xl border ${tm.border} ${tm.bg} p-4 cursor-pointer hover:shadow-md transition-shadow`}
                        onClick={() => { setFilterTurno(tr.turno); }}>
                        <div className="flex items-center gap-2 mb-1">
                          <TIcon className={`h-4 w-4 ${tm.text}`} />
                          <span className={`text-sm font-bold ${tm.text}`}>{tr.turno}</span>
                          <span className="text-[10px] text-gray-400">{tm.label}</span>
                        </div>
                        <p className={`text-xl font-black font-mono ${tm.text}`}>{tr.totalFuera}</p>
                        <p className="text-xs text-gray-500 mt-1">{tr.eventosCount} eventos &middot; {tr.empleados.length} operadores</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>



      {/* Toast notification */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
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
        <p className={`text-[11px] mt-1 ${subBg || ''} px-1.5 py-0.5 rounded inline-block ${subBg ? 'text-gray-500' : 'text-gray-400'}`}>{sub}</p>
      )}
    </div>
  );
}