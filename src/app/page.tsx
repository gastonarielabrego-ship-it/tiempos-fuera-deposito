'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Upload, RefreshCw, Clock, Users, UtensilsCrossed, ScanFace,
  FileSpreadsheet, Search, Sun, Sunset, Moon, ChevronRight,
  ArrowUpFromLine, ArrowDownToLine, LogOut, LogIn, Eye, X,
} from 'lucide-react';

/* ────── Types ────── */

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
}

interface TurnoRanking { turno: string; label: string; empleados: RankingEntry[]; }

interface Summary {
  totalEmployees: number; totalRecords: number; totalComidas: number;
  totalFacial: number; avgOutsidePerEmployee: string; dates: string[];
}

interface DashboardData {
  employees: EmployeeDay[]; ranking: RankingEntry[];
  rankingPorTurno: TurnoRanking[]; turnos: string[]; summary: Summary;
}

/* ────── Helpers ────── */

const timeToS = (t: string) => {
  if (!t) return 0;
  const p = t.split(':');
  return (Number(p[0]) || 0) * 3600 + (Number(p[1]) || 0) * 60 + (Number(p[2]) || 0);
};

const durColor = (s: number) => s <= 1800 ? 'text-emerald-600' : s <= 3600 ? 'text-amber-600' : 'text-red-600';
const durBg = (s: number) => s <= 1800 ? 'bg-emerald-50' : s <= 3600 ? 'bg-amber-50' : 'bg-red-50';

const turnoConfig: Record<string, { icon: typeof Sun; color: string; bg: string; border: string; badge: string }> = {
  TM: { icon: Sun, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-500' },
  TT: { icon: Sunset, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-500' },
  TN: { icon: Moon, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', badge: 'bg-indigo-500' },
  OTRO: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-400' },
};

/* ────── Main ────── */

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [profileEmp, setProfileEmp] = useState<EmployeeDay | null>(null);
  const [profileDateIdx, setProfileDateIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/dashboard');
      if (r.ok) setData(await r.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetch(); }, [fetch]);

  const upload = async (ep: string, file: File) => {
    setUploading(ep);
    const fd = new FormData(); fd.append('file', file);
    try { const r = await fetch(ep, { method: 'POST', body: fd }); if (r.ok) fetch(); }
    catch (e) { console.error(e); }
    finally { setUploading(null); }
  };

  // Filtered ranking por turno
  const filteredRanking = useMemo(() => {
    if (!data) return [];
    return data.rankingPorTurno.map(tr => ({
      ...tr,
      empleados: tr.empleados.filter(e =>
        (!search || e.nombre.toLowerCase().includes(search.toLowerCase()) || String(e.codigoEmp).includes(search)) &&
        (selectedDate === 'all' || true) // ranking is aggregated across all dates
      ),
    })).filter(tr => tr.empleados.length > 0);
  }, [data, search, selectedDate]);

  // Employee days for profile dialog
  const empDays = useMemo(() => {
    if (!profileEmp || !data) return [];
    return data.employees.filter(e => e.codigoEmp === profileEmp.codigoEmp).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [profileEmp, data]);

  const profileDay = empDays[profileDateIdx] || null;

  const openProfile = (codigoEmp: number) => {
    if (!data) return;
    const emp = data.employees.find(e => e.codigoEmp === codigoEmp);
    if (emp) { setProfileEmp(emp); setProfileDateIdx(0); }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex flex-col">
      {/* ── Top bar ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Clock className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">Tiempos Fuera de Deposito</h1>
              <p className="text-[10px] text-gray-400">Control de accesos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-xs text-gray-500" onClick={() => setShowUpload(!showUpload)}>
              <Upload className="h-3.5 w-3.5 mr-1" /> Cargar
            </Button>
            <Button variant="ghost" size="sm" className="text-xs text-gray-500" onClick={fetch} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-5 space-y-4">
        {/* ── Upload panel (collapsible) ── */}
        {showUpload && (
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Accesos', ep: '/api/upload-accesos', icon: FileSpreadsheet, color: 'text-emerald-600 hover:border-emerald-300' },
                  { label: 'Comidas', ep: '/api/upload-comidas', icon: UtensilsCrossed, color: 'text-orange-500 hover:border-orange-300' },
                  { label: 'Facial', ep: '/api/upload-facial', icon: ScanFace, color: 'text-blue-500 hover:border-blue-300' },
                ].map(({ label, ep, icon: Icon, color }) => (
                  <label
                    key={ep}
                    className={`border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer transition-colors ${color} ${uploading === ep ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <input type="file" accept=".xlsx,.xls" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) { upload(ep, f); e.target.value = ''; } }} />
                    <Icon className="h-6 w-6 mx-auto mb-1.5" />
                    <p className="text-xs font-medium text-gray-700">{label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {uploading === ep ? 'Procesando...' : '.xlsx'}
                    </p>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2 text-center">Los datos se sobreescriben con cada carga</p>
            </CardContent>
          </Card>
        )}

        {/* ── Summary chips ── */}
        {data && !loading && (
          <div className="flex items-center gap-3 flex-wrap">
            <Chip icon={<Users className="h-3.5 w-3.5" />} label="Empleados" value={String(data.summary.totalEmployees)} />
            <Chip icon={<Clock className="h-3.5 w-3.5" />} label="Prom. Fuera" value={data.summary.avgOutsidePerEmployee} />
            <div className="flex-1" />
            {data.summary.dates.map(d => (
              <button key={d} onClick={() => setSelectedDate(selectedDate === d ? 'all' : d)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${selectedDate === d ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>
                {d}
              </button>
            ))}
          </div>
        )}

        {/* ── Search ── */}
        {data && !loading && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-300" />
            <Input placeholder="Buscar empleado..." value={search} onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm bg-white border-gray-200" />
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && data && data.rankingPorTurno.length === 0 && (
          <div className="text-center py-20">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">Subi los archivos Excel para comenzar</p>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            RANKING POR TURNO
            ═══════════════════════════════════════════ */}
        {!loading && filteredRanking.map(tr => {
          const cfg = turnoConfig[tr.turno] || turnoConfig.OTRO;
          const TurnoIcon = cfg.icon;
          const top = tr.empleados.slice(0, 3);
          const rest = tr.empleados.slice(3);

          return (
            <div key={tr.turno} className="space-y-3">
              {/* Turno header */}
              <div className="flex items-center gap-2 px-1">
                <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                  <TurnoIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">{tr.turno}</h2>
                  <p className="text-[10px] text-gray-400">{tr.label} &middot; {tr.empleados.length} empleados</p>
                </div>
              </div>

              {/* Top 3 cards */}
              {top.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {top.map((emp, idx) => (
                    <button
                      key={emp.codigoEmp}
                      onClick={() => openProfile(emp.codigoEmp)}
                      className={`rounded-xl border p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5 ${idx === 0
                        ? 'bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200'
                        : idx === 1
                          ? 'bg-gradient-to-br from-gray-50 to-gray-100/50 border-gray-200'
                          : 'bg-gradient-to-br from-orange-50 to-orange-100/50 border-orange-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white ${cfg.badge}`}>
                          #{idx + 1}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-gray-900 truncate">{emp.nombre}</p>
                      <p className={`text-lg font-black font-mono mt-1 ${durColor(emp.totalFueraSegundos)}`}>
                        {emp.totalFuera}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">{emp.diasCount} dia{emp.diasCount !== 1 ? 's' : ''} &middot; Prom: {emp.avgPorDia}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* Rest of ranking */}
              {rest.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {rest.map((emp, idx) => (
                      <button
                        key={emp.codigoEmp}
                        onClick={() => openProfile(emp.codigoEmp)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/80 transition-colors"
                      >
                        <span className="text-xs font-bold text-gray-300 w-6 text-right">{idx + 4}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{emp.nombre}</p>
                          <p className="text-[10px] text-gray-400">{emp.diasCount} dias &middot; Prom: {emp.avgPorDia}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold font-mono ${durColor(emp.totalFueraSegundos)}`}>{emp.totalFuera}</p>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          );
        })}
      </main>

      {/* ═══════════════════════════════════════════
          PROFILE DIALOG
          ═══════════════════════════════════════════ */}
      <Dialog open={profileEmp !== null} onOpenChange={o => { if (!o) setProfileEmp(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[88vh] p-0 overflow-hidden flex flex-col">
          {/* Header */}
          {profileEmp && (
            <div className="bg-gray-900 text-white px-5 py-4 shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <DialogTitle className="text-white text-base">{profileEmp.nombre}</DialogTitle>
                  <DialogDescription className="text-gray-400 text-xs mt-0.5">
                    {profileEmp.empresa} &middot; {profileEmp.sector} &middot; Codigo {profileEmp.codigoEmp}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${turnoConfig[profileEmp.turno]?.badge || 'bg-gray-400'} text-white`}>
                    {profileEmp.turno}
                  </span>
                </div>
              </div>
              {/* Date tabs */}
              <div className="flex gap-1.5 mt-3 overflow-x-auto">
                {empDays.map((d, i) => (
                  <button key={d.fecha} onClick={() => setProfileDateIdx(i)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${profileDateIdx === i
                      ? 'bg-white text-gray-900'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}>
                    {d.fecha} {d.totalFueraSegundos > 0 ? `(${d.totalFuera})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          {profileDay && (
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-5">
                {/* Times outside */}
                <div>
                  <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tiempos Fuera de Deposito</h3>
                  {profileDay.tiemposFuera.length === 0 ? (
                    <p className="text-sm text-gray-300 italic">Sin salidas registradas</p>
                  ) : (
                    <div className="space-y-1.5">
                      {profileDay.tiemposFuera.map((t, i) => (
                        <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <ArrowUpFromLine className="h-3 w-3 text-red-400" />
                            <span className="text-xs font-mono text-red-500">{t.salida}</span>
                            <span className="text-gray-200 text-xs">→</span>
                            <ArrowDownToLine className="h-3 w-3 text-emerald-400" />
                            <span className="text-xs font-mono text-emerald-500">{t.entrada}</span>
                          </div>
                          <span className={`text-xs font-bold font-mono ${durColor(t.duracionSegundos)}`}>{t.duracion}</span>
                        </div>
                      ))}
                      {profileDay.tiemposFuera.length > 1 && (
                        <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-100">
                          <span className="text-xs font-semibold text-emerald-700">Total</span>
                          <span className="text-sm font-black font-mono text-emerald-700">{profileDay.totalFuera}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div>
                  <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Linea de Tiempo</h3>
                  <TimelineView day={profileDay} />
                </div>

                {/* Comidas */}
                {profileDay.comidasHoras.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">TK Comida</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profileDay.comidasHoras.map((h, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-100">
                          <UtensilsCrossed className="h-3 w-3" /> {h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Facial */}
                {profileDay.facialRegistros.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Registros Faciales</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profileDay.facialRegistros.map((f, i) => (
                        <span key={i} className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                          f.zona.toLowerCase().includes('entrada')
                            ? 'bg-blue-50 text-blue-600 border-blue-100'
                            : 'bg-purple-50 text-purple-600 border-purple-100'
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

/* ────── Sub-components ────── */

function Chip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
      <span className="text-gray-400">{icon}</span>
      <span className="text-[10px] text-gray-400">{label}</span>
      <span className="text-xs font-bold text-gray-800">{value}</span>
    </div>
  );
}

function TimelineView({ day }: { day: EmployeeDay }) {
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

  if (events.length === 0) return <p className="text-sm text-gray-300 italic py-2">Sin eventos</p>;

  const minSeg = Math.max(0, Math.floor(events[0].seg / 3600) * 3600 - 3600);
  const maxSeg = Math.min(86400, Math.ceil(events[events.length - 1].seg / 3600) * 3600 + 3600);
  const range = maxSeg - minSeg || 1;
  const pct = (seg: number) => ((seg - minSeg) / range) * 100;

  // Outside bands
  const bands = day.tiemposFuera.map(t => ({
    left: pct(timeToS(t.salida)),
    width: Math.min(((timeToS(t.entrada) - timeToS(t.salida) + (timeToS(t.entrada) < timeToS(t.salida) ? 86400 : 0)) / range) * 100, 100),
  }));

  const markerStyle: Record<string, { bg: string; icon: typeof LogIn }> = {
    entrada: { bg: 'bg-emerald-500', icon: LogIn },
    salida: { bg: 'bg-red-500', icon: LogOut },
    facial: { bg: 'bg-blue-500', icon: ScanFace },
    comida: { bg: 'bg-orange-500', icon: UtensilsCrossed },
  };

  return (
    <div className="space-y-1">
      {/* Bar */}
      <div className="relative h-10 bg-gray-100 rounded-lg border border-gray-200 overflow-visible">
        {bands.map((b, i) => (
          <div key={i} className="absolute top-0 bottom-0 bg-red-100/70 rounded" style={{ left: `${b.left}%`, width: `${b.width}%` }} />
        ))}
        {events.map((ev, i) => {
          const ms = markerStyle[ev.tipo] || markerStyle.entrada;
          const Icon = ms.icon;
          return (
            <div key={i} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group" style={{ left: `${pct(ev.seg)}%` }}>
              <div className={`w-5 h-5 ${ms.bg} rounded-full flex items-center justify-center text-white shadow-sm hover:scale-125 transition-transform cursor-default`}>
                <Icon className="h-2.5 w-2.5" />
              </div>
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded text-[9px] bg-gray-900 text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {ev.hora} — {ev.label}
              </div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
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