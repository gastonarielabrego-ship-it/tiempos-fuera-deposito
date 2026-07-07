'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import {
  Upload, RefreshCw, Clock, Users,
  FileSpreadsheet, Search, Sun, Sunset, Moon,
  AlertTriangle, CheckCircle2, XCircle, Coffee,
  FileText, Printer, Trash2, Copy,
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

interface Sancion {
  id: string; codigoEmp: number; nombre: string; empresa: string; sector: string;
  jornada: string; fecha: string; salida: string; entrada: string;
  duracion: string; duracionSegundos: number; tipo: string; tipoLabel: string;
  createdAt: string;
}
interface SancionStat {
  codigoEmp: number; nombre: string; empresa: string;
  totalSanciones: number; ultimaSancion: string;
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

const EMPRESAS_EXCLUIDAS = ['GESTION EE-EXTERNO', 'GESTION EE-EXTERNO(SELECCION)', 'G.L.D. GREMIAL EE'];
// Keywords for flexible matching - if empresa contains ANY of these, it gets excluded
const EMPRESAS_KEYWORDS = ['GREMIAL', 'EE-EXTERNO'];
const isEmpresaExcluida = (empresa: string) => {
  const upper = empresa.toUpperCase().trim();
  // Direct match first
  if (EMPRESAS_EXCLUIDAS.some(ex => upper.includes(ex.toUpperCase()))) return true;
  // Keyword fallback
  return EMPRESAS_KEYWORDS.some(kw => upper.includes(kw));
};

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
  const [activeTab, setActiveTab] = useState<'ranking' | 'doble-entrada' | 'desayuno' | 'break-tarde' | 'break-noche' | 'sanciones'>('ranking');
  const [showUpload, setShowUpload] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const [fechaFilter, setFechaFilter] = useState('');
  const [sanciones, setSanciones] = useState<Sancion[]>([]);
  const [sancionStats, setSancionStats] = useState<SancionStat[]>([]);
  const [rankingSubTab, setRankingSubTab] = useState<'tiempo' | 'salidas'>('tiempo');

  // ── Doble Entrada: consecutive Entrada Depo without Salida in between ──
  const dobleEntrada = useMemo(() => {
    if (!data) return [] as { codigoEmp: number; nombre: string; empresa: string; fecha: string; hora1: string; hora2: string; turno: string }[];
    const results: { codigoEmp: number; nombre: string; empresa: string; fecha: string; hora1: string; hora2: string; turno: string }[] = [];
    for (const emp of filteredEmployees) {
      if (isEmpresaExcluida(emp.empresa)) continue;
      const eventos = emp.accesosEventos;
      for (let i = 0; i < eventos.length - 1; i++) {
        const curr = eventos[i];
        const next = eventos[i + 1];
        if (curr.terminal === 'Entrada Depo' && next.terminal === 'Entrada Depo') {
          results.push({
            codigoEmp: emp.codigoEmp, nombre: emp.nombre, empresa: emp.empresa,
            fecha: emp.fecha, hora1: curr.hora, hora2: next.hora, turno: emp.turno,
          });
        }
      }
    }
    return results;
  }, [data, filteredEmployees]);

  const dobleEntradaFiltered = useMemo(() => {
    if (!search) return dobleEntrada;
    const s = search.toLowerCase();
    return dobleEntrada.filter(e => e.nombre.toLowerCase().includes(s) || String(e.codigoEmp).includes(s));
  }, [dobleEntrada, search]);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  const fetchSanciones = useCallback(async () => {
    try {
      const r = await window.fetch('/api/sanciones');
      if (r.ok) {
        const json = await r.json();
        setSanciones(json.sanciones || []);
        setSancionStats(json.stats || []);
      }
    } catch { /* silent */ }
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
        else await fetchSanciones();
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
  }, [fetchSanciones]);

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
        if (json?.count === 0 && json?.debug) {
          showToast(`${label}: 0 registros. Columnas: ${json.debug.columns?.join(', ')}`, 'error');
        } else {
          showToast(`${label}: ${json?.count ?? 0} registros cargados`, 'success');
        }
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

  // Filter employees by fechaFilter
  const filteredEmployees = useMemo(() => {
    if (!data) return [];
    const base = fechaFilter ? data.employees.filter(e => e.fecha === fechaFilter) : data.employees;
    return base.filter(e => !isEmpresaExcluida(e.empresa));
  }, [data, fechaFilter]);

  // Build map: codigoEmp -> primary turno (most frequent turno across all their days)
  const empTurnoMap = useMemo(() => {
    if (!data) return new Map<number, string>();
    const map = new Map<number, Map<string, number>>();
    for (const ed of filteredEmployees) {
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

  const openProfile = (codigo: number) => {
    window.location.href = `/operator/${codigo}`;
  };

  /* ── Generic Exceso builder ── */
  interface ExcesoEntry {
    codigoEmp: number; nombre: string; empresa: string; sector: string;
    totalFueraSegundos: number; dias: Set<string>; eventos: { fecha: string; salida: string; entrada: string; duracion: string; duracionSegundos: number }[];
  }

  const buildExcesoRanking = useCallback((salidaMinSeg: number, salidaMaxSeg: number, minDurSeg: number): ExcesoEntry[] => {
    if (!data) return [];
    const map = new Map<number, ExcesoEntry>();
    for (const emp of filteredEmployees) {
      for (const tf of emp.tiemposFuera) {
        const salidaSeg = timeToS(tf.salida);
        const inWindow = salidaSeg >= salidaMinSeg && salidaSeg <= salidaMaxSeg;
        const isExcess = tf.duracionSegundos > minDurSeg;
        if (inWindow && isExcess) {
          if (!map.has(emp.codigoEmp)) {
            map.set(emp.codigoEmp, { codigoEmp: emp.codigoEmp, nombre: emp.nombre, empresa: emp.empresa, sector: emp.sector, totalFueraSegundos: 0, dias: new Set(), eventos: [] });
          }
          const entry = map.get(emp.codigoEmp)!;
          entry.totalFueraSegundos += tf.duracionSegundos;
          entry.dias.add(emp.fecha);
          entry.eventos.push({ fecha: emp.fecha, salida: tf.salida, entrada: tf.entrada, duracion: tf.duracion, duracionSegundos: tf.duracionSegundos });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalFueraSegundos - a.totalFueraSegundos);
  }, [data]);

  /* ── Exceso Desayuno: 06:45–09:45, >25min ── */
  const desayunoRanking = useMemo(() => buildExcesoRanking(6*3600+45*60, 9*3600+45*60, 25*60), [buildExcesoRanking]);
  /* ── Exceso Break Tarde: 16:30–17:30, >15min ── */
  const breakTardeRanking = useMemo(() => buildExcesoRanking(16*3600+30*60, 17*3600+30*60, 15*60), [buildExcesoRanking]);
  /* ── Exceso Break Noche: 02:40–03:30, >15min ── */
  const breakNocheRanking = useMemo(() => buildExcesoRanking(2*3600+40*60, 3*3600+30*60, 15*60), [buildExcesoRanking]);

  const filterExceso = (list: ExcesoEntry[]) => list.filter(e => {
    const matchSearch = !search || e.nombre.toLowerCase().includes(search.toLowerCase()) || String(e.codigoEmp).includes(search);
    return matchSearch;
  });
  const desayunoFiltered = useMemo(() => filterExceso(desayunoRanking), [desayunoRanking, search]);
  const breakTardeFiltered = useMemo(() => filterExceso(breakTardeRanking), [breakTardeRanking, search]);
  const breakNocheFiltered = useMemo(() => filterExceso(breakNocheRanking), [breakNocheRanking, search]);

  const excesoStats = (list: ExcesoEntry[]) => ({
    totalEventos: list.reduce((s, e) => s + e.eventos.length, 0),
    totalSegundos: list.reduce((s, e) => s + e.totalFueraSegundos, 0),
    empleadosUnicos: list.length,
  });
  const desayunoStats = useMemo(() => excesoStats(desayunoFiltered), [desayunoFiltered]);
  const breakTardeStats = useMemo(() => excesoStats(breakTardeFiltered), [breakTardeFiltered]);
  const breakNocheStats = useMemo(() => excesoStats(breakNocheFiltered), [breakNocheFiltered]);

  // Recompute ranking from filtered employees when date filter is active
  const activeRanking = useMemo(() => {
    if (!fechaFilter || !data) return data?.ranking || [];
    const rMap = new Map<number, RankingEntry>();
    for (const emp of filteredEmployees) {
      if (!rMap.has(emp.codigoEmp)) {
        rMap.set(emp.codigoEmp, { codigoEmp: emp.codigoEmp, nombre: emp.nombre, empresa: emp.empresa, sector: emp.sector, totalFueraSegundos: 0, diasCount: 0, avgPorDia: '00:00:00', maxDiaFuera: '00:00:00', maxDiaFecha: '', eventosCount: 0 });
      }
      const r = rMap.get(emp.codigoEmp)!;
      r.totalFueraSegundos += emp.totalFueraSegundos;
      r.eventosCount += emp.tiemposFuera.length;
    }
    // Finalize: set diasCount, avg, max
    for (const r of rMap.values()) {
      const empDays = filteredEmployees.filter(e => e.codigoEmp === r.codigoEmp);
      r.diasCount = empDays.length;
      const diasConFuera = empDays.filter(e => e.totalFueraSegundos > 0);
      r.avgPorDia = diasConFuera.length > 0 ? formatHMS(Math.round(r.totalFueraSegundos / diasConFuera.length)) : '00:00:00';
      const maxDay = empDays.reduce((max, d) => d.totalFueraSegundos > max.totalFueraSegundos ? d : max, empDays[0]);
      if (maxDay) { r.maxDiaFuera = maxDay.totalFuera; r.maxDiaFecha = maxDay.fecha; }
    }
    return Array.from(rMap.values()).sort((a, b) => b.totalFueraSegundos - a.totalFueraSegundos);
  }, [data, filteredEmployees, fechaFilter]);

  // Recompute turno cards from filtered employees when date filter is active
  const activeTurnoCards = useMemo(() => {
    if (!fechaFilter) return data?.rankingPorTurno || [];
    return data?.rankingPorTurno.map(tr => ({
      ...tr,
      empleados: tr.empleados.filter(e => filteredEmployees.some(fe => fe.codigoEmp === e.codigoEmp && fe.fecha === fechaFilter)),
      totalFueraSegundos: tr.empleados.filter(e => filteredEmployees.some(fe => fe.codigoEmp === e.codigoEmp && fe.fecha === fechaFilter)).reduce((s, e) => s + e.totalFueraSegundos, 0),
      totalFuera: formatHMS(tr.empleados.filter(e => filteredEmployees.some(fe => fe.codigoEmp === e.codigoEmp && fe.fecha === fechaFilter)).reduce((s, e) => s + e.totalFueraSegundos, 0)),
      eventosCount: tr.empleados.filter(e => filteredEmployees.some(fe => fe.codigoEmp === e.codigoEmp && fe.fecha === fechaFilter)).reduce((s, e) => s + e.eventosCount, 0),
    })) || [];
  }, [data, filteredEmployees, fechaFilter]);


  const filteredRanking = useMemo(() => {
    if (!data) return [];
    return activeRanking.filter(e => {
      if (isEmpresaExcluida(e.empresa)) return false;
      const matchSearch = !search || e.nombre.toLowerCase().includes(search.toLowerCase()) || String(e.codigoEmp).includes(search);
      const empTurno = empTurnoMap.get(e.codigoEmp) || 'OTRO';
      const matchTurno = filterTurno === 'all' || empTurno === filterTurno;
      return matchSearch && matchTurno;
    });
  }, [data, search, filterTurno, empTurnoMap, activeRanking]);

  const rankingByTime = useMemo(() =>
    [...filteredRanking].sort((a, b) => b.totalFueraSegundos - a.totalFueraSegundos),
    [filteredRanking]);

  const rankingByExits = useMemo(() =>
    [...filteredRanking].sort((a, b) => b.eventosCount - a.eventosCount || b.totalFueraSegundos - a.totalFueraSegundos),
    [filteredRanking]);

  const filteredTurnoCards = useMemo(() => {
    if (!data) return [];
    return activeTurnoCards.filter(tr => tr.empleados.length > 0);
  }, [data, activeTurnoCards]);

  const totalFueraAll = activeRanking.reduce((s, e) => s + e.totalFueraSegundos, 0) || 0;
  const maxFuera = activeRanking[0];
  const totalEventos = filteredEmployees.reduce((s, e) => s + e.tiemposFuera.length, 0) || 0;

  const hasData = data && data.employees.length > 0;
  const isEmpty = data && data.employees.length === 0 && !error;

  const generateSancion = useCallback(async (codigoEmp: number, fecha: string, salida: string, entrada: string, duracion: string, duracionSegundos: number, tipo: string) => {
    try {
      const tipoLabels: Record<string, string> = {
        desayuno: 'EXCESO DE DESAYUNO',
        'break-tarde': 'EXCESO BREAK TARDE',
        'break-noche': 'EXCESO BREAK NOCHE',
      };
      const r = await window.fetch('/api/sanciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigoEmp, fecha, salida, entrada, duracion, duracionSegundos, tipo, tipoLabel: tipoLabels[tipo] || tipo.toUpperCase() }),
      });
      if (r.ok) {
        showToast('Sancion registrada correctamente', 'success');
        await fetchSanciones();
      } else {
        const err = await r.json().catch(() => ({}));
        showToast(err.error || 'Error al registrar sancion', 'error');
      }
    } catch {
      showToast('Error de conexion al registrar sancion', 'error');
    }
  }, [showToast, fetchSanciones]);

  const printSancion = useCallback(async (id: string) => {
    try {
      const [sancionR, movR] = await Promise.all([
        window.fetch(`/api/sanciones/${id}`),
        window.fetch(`/api/sanciones/${id}/movimientos`),
      ]);
      if (!sancionR.ok) { showToast('Error al obtener sancion', 'error'); return; }
      const sancion = await sancionR.json();
      const movRows = movR.ok ? await movR.json() : [];

      // Build unified movements from sancion + aux records
      const allMov = [
        // Access records (from sancion salida/entrada)
        { hora: sancion.salida, evento: 'Salida Depo', tipo: 'Acceso' },
        { hora: sancion.entrada, evento: 'Entrada Depo', tipo: 'Acceso' },
        // Aux records (facial + comida)
        ...movRows.map((m: { hora: string; tipo: string; detalle: string }) => ({
          hora: m.hora,
          evento: m.detalle || (m.tipo === 'FACIAL' ? 'Facial' : 'TK Comida'),
          tipo: m.tipo === 'FACIAL' ? 'Facial' : 'Comida',
        })),
      ].sort((a: { hora: string }, b: { hora: string }) => a.hora.localeCompare(b.hora));

      const today = new Date().toISOString().split('T')[0];
      const [yr, mo, dy] = today.split('-');

      const win = window.open('', '_blank', 'width=800,height=1000');
      if (!win) { showToast('Permite ventanas emergentes para imprimir', 'error'); return; }

      win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Pedido de Explicacion - ${sancion.nombre}</title>
<style>
  @page { size: A4; margin: 1.2cm 1.5cm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000; }
  .header-img { width: 100%; max-width: 520px; }
  .title { text-align: center; font-size: 14pt; font-weight: bold; margin: 6px 0 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; }
  th, .header-cell { background: #C8C8C8; font-weight: bold; font-size: 10pt; }
  .box-section h3 { font-size: 11pt; font-weight: bold; margin-bottom: 3px; }
  .mov-table { font-size: 8pt; width: auto; margin-top: 6px; }
  .mov-table th { background: #DDD; font-size: 8pt; }
  .mov-table td, .mov-table th { padding: 2px 4px; }
  .footer-img { width: 100%; max-width: 700px; margin-top: 12px; }
  .no-print { margin-bottom: 10px; }

  /* Page 2: flex container fills exactly one A4, boxes grow/shrink dynamically */
  .page2 {
    display: flex;
    flex-direction: column;
    height: 272mm;
    overflow: hidden;
  }
  .p2-section { display: flex; flex-direction: column; }
  .p2-section.colab { flex: 4; }
  .p2-section.coord { flex: 3; }
  .p2-section.suger { flex: 2; }
  .p2-label { font-size: 11pt; font-weight: bold; margin-bottom: 1mm; flex-shrink: 0; }
  .p2-box { flex: 1; border: 1px solid #000; width: 100%; min-height: 0; }
  .p2-sig-row { flex-shrink: 0; margin-top: 4mm; }
  .p2-sig-row td { text-align: center; height: 22mm; vertical-align: bottom; border: none; border-top: 1px solid #000; }
  .p2-footer { flex-shrink: 0; margin-top: auto; }
  .p2-footer img { width: 100%; max-width: 500px; }
  .footer-img { width: 100%; max-width: 500px; margin-top: 6mm; }

  @media print {
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>
<div class="no-print" style="text-align:center;padding:8px;background:#f0f0f0;margin-bottom:10px;">
  <button onclick="window.print()" style="padding:8px 24px;font-size:12pt;cursor:pointer;border:1px solid #999;border-radius:4px;background:#fff;">
    Imprimir
  </button>
</div>

<!-- ═══════════ HOJA 1: EVIDENCIA ═══════════ -->
<img class="header-img" src="/template_header.png" alt="Logo">
<div class="title">PEDIDO DE EXPLICACION</div>

<table>
  <tr><th class="header-cell">Datos del Colaborador</th><th class="header-cell">Datos de Coordinadores</th></tr>
  <tr><td><b>Apellido y Nombre:</b> ${sancion.nombre || '-'}</td><td><b>Apellido y Nombre:</b> </td></tr>
  <tr><td><b>Legajo:</b> ${sancion.codigoEmp || '-'}</td><td><b>Sector:</b> </td></tr>
  <tr><td><b>Sector:</b> PREPARACION</td><td><b>Interviene por RR.HH.</b> </td></tr>
  <tr><td><b>Funcion:</b> PREPARADOR</td><td><b>Apellido y Nombre:</b> </td></tr>
  <tr><td><b>Turno:</b> ${sancion.jornada || '-'}</td><td></td></tr>
</table>

<table>
  <tr><td><b>Fecha:</b> ${dy} / ${mo} / ${yr}</td></tr>
</table>

<table>
  <tr><th colspan="2" class="header-cell" style="font-size:12pt;">Incidencia Proceso Operaciones</th></tr>
  <tr>
    <td style="width:42%;"><b>${(sancion.tipoLabel || sancion.tipo || '').toUpperCase()}</b></td>
    <td style="width:58%;">
      Colaborador: ${sancion.nombre} (Legajo: ${sancion.codigoEmp})<br>
      Empresa: ${sancion.empresa} | Sector: ${sancion.sector}<br>
      Fecha del hecho: ${sancion.fecha}<br>
      Salida del deposito: ${sancion.salida} hs<br>
      Reingreso al deposito: ${sancion.entrada} hs<br>
      Tiempo fuera de deposito: ${sancion.duracion}<br>
      Exceso supera el maximo permitido.
    </td>
  </tr>
</table>

<div class="box-section">
  <h3>Evidencia del Caso</h3>
  <table><tr><td style="min-height:140px; vertical-align:top; padding: 6px;">
    El colaborador ${sancion.nombre} (Legajo ${sancion.codigoEmp}), empleado de ${sancion.empresa}, sector ${sancion.sector}, registro una salida del deposito a las ${sancion.salida} hs y un reingreso a las ${sancion.entrada} hs del dia ${sancion.fecha}, generando un tiempo fuera de deposito de ${sancion.duracion}, superando el tiempo maximo permitido para el periodo correspondiente. Dicho exceso fue detectado mediante el sistema de control de accesos (molinetes).
    ${allMov.length > 0 ? `
    <table class="mov-table">
      <tr><th>#</th><th>Hora</th><th>Evento / Movimiento</th><th>Tipo</th></tr>
      ${allMov.map((m: { hora: string; evento: string; tipo: string }, i: number) => `<tr><td>${i + 1}</td><td>${m.hora}</td><td>${m.evento}</td><td>${m.tipo}</td></tr>`).join('')}
    </table>` : ''}
  </td></tr></table>
</div>

<!-- ═══════════ HOJA 2: DESCARGOS Y FIRMAS ═══════════ -->
<div class="page-break"></div>
<div class="page2">

  <div class="p2-section colab">
    <div class="p2-label">Descargo del Colaborador</div>
    <div class="p2-box"></div>
  </div>

  <div class="p2-section coord">
    <div class="p2-label">Descargo del Coordinador</div>
    <div class="p2-box"></div>
  </div>

  <div class="p2-section suger">
    <div class="p2-label">Sugerencias / Mejora / Compromiso</div>
    <div class="p2-box"></div>
  </div>

  <table class="p2-sig-row" style="width:100%; border-collapse:collapse;">
    <tr>
      <td style="width:33%;">Firma del Colaborador</td>
      <td style="width:33%;">Firma del Coordinador</td>
      <td style="width:34%;">Firma de RR.HH.</td>
    </tr>
  </table>

  <div class="p2-footer">
    <img src="/template_footer.png" alt="Footer">
  </div>
</div>

<script>setTimeout(()=>{window.print();},500);</script>
</body></html>`);
      win.document.close();
    } catch {
      showToast('Error al imprimir', 'error');
    }
  }, [showToast]);

  const deleteSancion = useCallback(async (id: string) => {
    try {
      const r = await window.fetch(`/api/sanciones/${id}`, { method: 'DELETE' });
      if (r.ok) {
        showToast('Sancion eliminada', 'success');
        await fetchSanciones();
      }
    } catch {
      showToast('Error al eliminar sancion', 'error');
    }
  }, [showToast, fetchSanciones]);

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
            {/* ── Tabs ── */}
            <div className="flex items-center gap-0.5 border-b border-gray-200 overflow-x-auto">
              <button onClick={() => setActiveTab('ranking')}
                className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'ranking' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                Ranking General
              </button>
              <button onClick={() => setActiveTab('doble-entrada')}
                className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'doble-entrada' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                <Copy className="h-3.5 w-3.5" /> Doble Entrada {dobleEntrada.length > 0 && <span className="bg-teal-500 text-white text-[10px] rounded-full w-4 h-4 inline-flex items-center justify-center">{dobleEntrada.length}</span>}
              </button>
              <button onClick={() => setActiveTab('desayuno')}
                className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'desayuno' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                <Coffee className="h-3.5 w-3.5" /> Exceso Desayuno
              </button>
              <button onClick={() => setActiveTab('break-tarde')}
                className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'break-tarde' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                <Sunset className="h-3.5 w-3.5" /> Break Tarde
              </button>
              <button onClick={() => setActiveTab('break-noche')}
                className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'break-noche' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                <Moon className="h-3.5 w-3.5" /> Break Noche
              </button>
              <button onClick={() => setActiveTab('sanciones')}
                className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'sanciones' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                <FileText className="h-3.5 w-3.5" /> Sanciones {sanciones.length > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full w-4 h-4 inline-flex items-center justify-center">{sanciones.length}</span>}
              </button>
            </div>

            {/* ── Date filter ── */}
            <div className="flex items-center gap-2 mb-3">
              <input type="date" value={fechaFilter}
                onChange={e => setFechaFilter(e.target.value)}
                className="h-8 text-xs border border-gray-300 rounded px-2 bg-white" />
              {fechaFilter && <button onClick={() => setFechaFilter('')} className="text-xs text-gray-400 hover:text-gray-600">✕ Limpiar</button>}
            </div>

            {/* ═══════════ TAB: RANKING GENERAL ═══════════ */}
            {activeTab === 'ranking' && (
              <div className="space-y-4 pt-1">
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

                {/* ── Sub-tabs: Tiempo / Salidas ── */}
                <div className="flex gap-1 mb-3">
                  <button onClick={() => setRankingSubTab('tiempo')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${rankingSubTab === 'tiempo' ? 'border-red-500 text-red-600 bg-red-50' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                    Mayor Tiempo Fuera
                  </button>
                  <button onClick={() => setRankingSubTab('salidas')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${rankingSubTab === 'salidas' ? 'border-purple-600 text-purple-700 bg-purple-50' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                    Mayor Cantidad de Salidas
                  </button>
                </div>

                {/* ── Tabla: Tiempo ── */}
                {rankingSubTab === 'tiempo' && (
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
                        {rankingByTime.map((emp, idx) => {
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
                )}

                {/* ── Tabla: Salidas ── */}
                {rankingSubTab === 'salidas' && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 w-12">#</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Operador</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 w-20">Turno</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-16">Salidas</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-32">T. Fuera Deposito</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-24">Prom/Dia</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-20">Dias</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-24">Mayor Dia</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rankingByExits.map((emp, idx) => {
                          const pos = idx + 1;
                          const rankBadge = pos <= 3 ? 'bg-purple-600' : pos <= 7 ? 'bg-purple-400' : '';
                          const rowBg = pos <= 3 ? 'bg-purple-50/40' : '';
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
                                <span className="font-mono font-bold text-purple-700">{emp.eventosCount}</span>
                              </td>
                              <td className="px-3 py-3 text-right">
                                <span className={`font-mono ${durTextColor(emp.totalFueraSegundos)}`}>{emp.totalFuera}</span>
                              </td>
                              <td className="px-3 py-3 text-right"><span className="font-mono text-gray-600 text-xs">{emp.avgPorDia}</span></td>
                              <td className="px-3 py-3 text-right"><span className="text-gray-600 text-sm">{emp.diasCount}</span></td>
                              <td className="px-3 py-3 text-right"><span className="font-mono text-xs text-gray-600">{emp.maxDiaFuera}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}

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
              </div>
            )}

            {/* ═══════════ TAB: DOBLE ENTRADA ═══════════ */}
            {activeTab === 'doble-entrada' && (
              <div className="space-y-4 pt-1">
                <div className="bg-teal-50 border border-teal-100 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Copy className="h-4 w-4 text-teal-600" />
                    <h2 className="text-sm font-bold text-teal-800">Registros con Doble Entrada</h2>
                  </div>
                  <p className="text-xs text-teal-700">Detecta eventos donde un operador registra dos <b>Entrada Depo</b> consecutivas sin una <b>Salida Depo</b> en medio.</p>
                  <p className="text-xs text-teal-600 mt-1"><b>{dobleEntradaFiltered.length}</b> casos encontrados {dobleEntradaFiltered.length !== dobleEntrada.length && `(filtrados de ${dobleEntrada.length})`}</p>
                </div>

                {dobleEntradaFiltered.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-300" />
                    <p className="text-sm">No se detectaron dobles entradas</p>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-left">
                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 w-12">#</th>
                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Operador</th>
                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 w-20">Turno</th>
                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 w-24">Fecha</th>
                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-20">1ra Entrada</th>
                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-20">2da Entrada</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {dobleEntradaFiltered.map((reg, idx) => {
                            const pos = idx + 1;
                            const empTurno = empTurnoMap.get(reg.codigoEmp) || reg.turno;
                            const tMeta = turnoMeta[empTurno] || DEFAULT_TURNO_META;
                            const TIcon = tMeta.icon;
                            return (
                              <tr key={`${reg.codigoEmp}-${reg.fecha}-${reg.hora1}`} className="bg-teal-50/30 hover:bg-teal-50/60 cursor-pointer transition-colors"
                                onClick={() => openProfile(reg.codigoEmp)}>
                                <td className="px-3 py-2.5">
                                  <span className="text-xs text-gray-400 font-medium pl-1.5">{pos}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <p className="font-semibold text-gray-800 text-sm">{reg.nombre}</p>
                                  <p className="text-[11px] text-gray-400">{reg.codigoEmp} &middot; {reg.empresa}</p>
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${tMeta.bg} ${tMeta.text} ${tMeta.border}`}>
                                    <TIcon className="h-3 w-3" /> {empTurno}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-sm text-gray-700">{reg.fecha}</td>
                                <td className="px-3 py-2.5 text-right font-mono text-xs text-teal-700 font-semibold">{reg.hora1}</td>
                                <td className="px-3 py-2.5 text-right font-mono text-xs text-red-600 font-semibold">{reg.hora2}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══════════ TAB: EXCESO DESAYUNO ═══════════ */}
            {activeTab === 'desayuno' && (
              <ExcesoTabContent
                title="Exceso de Desayuno"
                description="Salidas entre 06:45 y 09:45 hs con duracion mayor a 25 minutos"
                icon={<Coffee className="h-5 w-5 text-orange-500 shrink-0" />}
                iconSmall={<Coffee className="h-4 w-4" />}
                colorClass="orange"
                filtered={desayunoFiltered}
                stats={desayunoStats}
                openProfile={openProfile}
                tipo="desayuno"
                generateSancion={generateSancion}
              />
            )}

            {/* ═══════════ TAB: BREAK TARDE ═══════════ */}
            {activeTab === 'break-tarde' && (
              <ExcesoTabContent
                title="Exceso Break Tarde"
                description="Salidas entre 16:30 y 17:30 hs con duracion mayor a 15 minutos"
                icon={<Sunset className="h-5 w-5 text-purple-500 shrink-0" />}
                iconSmall={<Sunset className="h-4 w-4" />}
                colorClass="purple"
                filtered={breakTardeFiltered}
                stats={breakTardeStats}
                openProfile={openProfile}
                tipo="break-tarde"
                generateSancion={generateSancion}
              />
            )}

            {/* ═══════════ TAB: BREAK NOCHE ═══════════ */}
            {activeTab === 'break-noche' && (
              <ExcesoTabContent
                title="Exceso Break Noche"
                description="Salidas entre 02:40 y 03:30 hs con duracion mayor a 15 minutos"
                icon={<Moon className="h-5 w-5 text-blue-500 shrink-0" />}
                iconSmall={<Moon className="h-4 w-4" />}
                colorClass="blue"
                filtered={breakNocheFiltered}
                stats={breakNocheStats}
                openProfile={openProfile}
                tipo="break-noche"
                generateSancion={generateSancion}
              />
            )}

            {activeTab === 'sanciones' && (
              <SancionesTabContent
                sanciones={sanciones}
                stats={sancionStats}
                onPrint={printSancion}
                onDelete={deleteSancion}
                openProfile={openProfile}
                loading={loading}
              />
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
   EXCESO TAB CONTENT (reusable)
   ═══════════════════════════════════════ */

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge1: string; badge2: string; rowBg: string; hoverBg: string; headerBg: string }> = {
  orange: {
    bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge1: 'bg-orange-500', badge2: 'bg-amber-400',
    rowBg: 'bg-orange-50/40', hoverBg: 'hover:bg-orange-50/30', headerBg: 'bg-orange-50',
  },
  purple: {
    bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge1: 'bg-purple-500', badge2: 'bg-purple-300',
    rowBg: 'bg-purple-50/40', hoverBg: 'hover:bg-purple-50/30', headerBg: 'bg-purple-50',
  },
  blue: {
    bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge1: 'bg-blue-500', badge2: 'bg-blue-300',
    rowBg: 'bg-blue-50/40', hoverBg: 'hover:bg-blue-50/30', headerBg: 'bg-blue-50',
  },
};

function ExcesoTabContent({ title, description, icon, iconSmall, colorClass, filtered, stats, openProfile, tipo, generateSancion }: {
  title: string; description: string; icon: React.ReactNode; iconSmall: React.ReactNode;
  colorClass: string; filtered: { codigoEmp: number; nombre: string; empresa: string; totalFueraSegundos: number; dias: Set<string>; eventos: { fecha: string; salida: string; entrada: string; duracion: string; duracionSegundos: number }[] }[];
  stats: { totalEventos: number; totalSegundos: number; empleadosUnicos: number };
  openProfile: (c: number) => void;
  tipo: string;
  generateSancion: (c: number, f: string, s: string, e: string, d: string, ds: number, t: string) => void;
}) {
  const c = COLOR_MAP[colorClass] || COLOR_MAP.orange;
  const maxAllEvento = filtered.length > 0
    ? [...filtered.flatMap(e => e.eventos)].sort((a, b) => b.duracionSegundos - a.duracionSegundos)[0]
    : null;

  return (
    <div className="space-y-4 pt-1">
      {/* Info banner */}
      <div className={`${c.bg} border ${c.border} rounded-lg px-4 py-3 flex items-center gap-3`}>
        {icon}
        <div>
          <p className={`text-sm font-semibold ${c.text}`}>{title}</p>
          <p className="text-xs opacity-70 mt-0.5">{description}</p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={<Users className={`h-5 w-5 ${c.text}`} />} label="Empleados con Exceso" value={String(stats.empleadosUnicos)} accent={`border-l-current ${c.text}`} />
        <MetricCard icon={<Clock className="h-5 w-5 text-red-500" />} label="Suma Excesos" value={formatHMS(stats.totalSegundos)} sub={`${stats.totalEventos} eventos`} accent="border-l-red-500" subBg="bg-red-50" />
        <MetricCard icon={iconSmall} label="Promedio por Empleado" value={stats.empleadosUnicos > 0 ? formatHMS(Math.round(stats.totalSegundos / stats.empleadosUnicos)) : '0h 0m 0s'} accent={`border-l-amber-500`} />
        <MetricCard icon={<AlertTriangle className="h-5 w-5 text-red-600" />} label="Mayor Exceso" value={maxAllEvento?.duracion || '00:00:00'} sub={maxAllEvento ? `${filtered.find(e => e.eventos.includes(maxAllEvento))?.nombre || ''} ${maxAllEvento.fecha}` : ''} accent="border-l-red-600" />
      </div>

      {/* Detail table */}
      {filtered.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-800">{title}</h2>
            <span className="text-xs text-gray-400">{stats.totalEventos} registros · {filtered.length} operadores</span>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Fecha</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Operador</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Empresa</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center">Salida</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center">Entrada</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right">Duracion</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center w-24">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.flatMap(emp =>
                    emp.eventos.map(ev => ({ ...ev, nombre: emp.nombre, empresa: emp.empresa, codigoEmp: emp.codigoEmp }))
                  ).sort((a, b) => b.duracionSegundos - a.duracionSegundos).map((ev, i) => (
                    <tr key={i} className={`${c.hoverBg} cursor-pointer`} onClick={() => openProfile(ev.codigoEmp)}>
                      <td className="px-3 py-2 text-gray-600 text-xs">{ev.fecha}</td>
                      <td className="px-3 py-2"><span className="font-semibold text-gray-800 text-xs">{ev.nombre}</span></td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{ev.empresa}</td>
                      <td className="px-3 py-2 text-center font-mono text-xs text-red-600 font-medium">{ev.salida}</td>
                      <td className="px-3 py-2 text-center font-mono text-xs text-emerald-600 font-medium">{ev.entrada}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono text-xs font-bold ${durTextColor(ev.duracionSegundos)}`}>{ev.duracion}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={(e) => { e.stopPropagation(); generateSancion(ev.codigoEmp, ev.fecha, ev.salida, ev.entrada, ev.duracion, ev.duracionSegundos, tipo); }}
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
                          title="Registrar Pedido de Explicacion">
                          <AlertTriangle className="h-3 w-3" /> Sancionar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SancionesTabContent({ sanciones, stats, onPrint, onDelete, openProfile, loading }: {
  sanciones: Sancion[];
  stats: SancionStat[];
  onPrint: (id: string) => void;
  onDelete: (id: string) => void;
  openProfile: (c: number) => void;
  loading: boolean;
}) {
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [filtroNombre, setFiltroNombre] = useState('');
  const [verStats, setVerStats] = useState(false);

  const sortedStats = useMemo(() =>
    [...stats].sort((a, b) => b.totalSanciones - a.totalSanciones || b.ultimaSancion.localeCompare(a.ultimaSancion)),
  [stats]);

  // Build a quick lookup for sanction count per employee
  const countByEmp = useMemo(() => {
    const m: Record<number, number> = {};
    for (const s of sanciones) m[s.codigoEmp] = (m[s.codigoEmp] || 0) + 1;
    return m;
  }, [sanciones]);

  const filteredSanciones = useMemo(() => {
    let result = sanciones;
    if (fechaDesde) result = result.filter(s => s.fecha >= fechaDesde);
    if (fechaHasta) result = result.filter(s => s.fecha <= fechaHasta);
    if (filtroNombre.trim()) {
      const q = filtroNombre.toLowerCase().trim();
      result = result.filter(s => s.nombre.toLowerCase().includes(q) || String(s.codigoEmp).includes(q));
    }
    return result;
  }, [sanciones, fechaDesde, fechaHasta, filtroNombre]);

  const filteredStats = useMemo(() => {
    const empCodigos = new Set(filteredSanciones.map(s => s.codigoEmp));
    return sortedStats.filter(s => empCodigos.has(s.codigoEmp));
  }, [sortedStats, filteredSanciones]);

  const tipoColors: Record<string, string> = {
    desayuno: 'bg-orange-100 text-orange-700 border-orange-200',
    'break-tarde': 'bg-purple-100 text-purple-700 border-purple-200',
    'break-noche': 'bg-blue-100 text-blue-700 border-blue-200',
  };

  const limpiarFiltros = () => { setFechaDesde(''); setFechaHasta(''); setFiltroNombre(''); };

  const tieneFiltros = fechaDesde || fechaHasta || filtroNombre.trim();

  return (
    <div className="space-y-4 pt-1">
      {/* Header */}
      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3">
        <FileText className="h-5 w-5 text-red-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-700">Pedidos de Explicacion</p>
          <p className="text-xs opacity-70 text-red-600/70">Sanciones registradas por excesos de tiempo fuera de deposito</p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={<FileText className="h-5 w-5 text-red-500" />} label="Total Sanciones" value={String(filteredSanciones.length)} accent="border-l-red-500" />
        <MetricCard icon={<Users className="h-5 w-5 text-blue-500" />} label="Empleados Sancionados" value={String(filteredStats.length)} accent="border-l-blue-500" />
        <MetricCard icon={<AlertTriangle className="h-5 w-5 text-amber-500" />} label="Mayor Sancionado" value={filteredStats[0]?.nombre?.split(' ').slice(0, 2).join(' ') || '\u2014'} sub={filteredStats[0] ? `${filteredStats[0].totalSanciones} sanciones` : ''} accent="border-l-amber-500" />
        <MetricCard icon={<Clock className="h-5 w-5 text-purple-500" />} label="Ultima Sancion" value={filteredSanciones[0]?.fecha || '\u2014'} sub={filteredSanciones[0]?.nombre || ''} accent="border-l-purple-500" />
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500">Desde</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500">Hasta</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-[11px] font-medium text-gray-500">Buscar operador</label>
            <input type="text" placeholder="Nombre o codigo..." value={filtroNombre} onChange={e => setFiltroNombre(e.target.value)}
              className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400" />
          </div>
          {tieneFiltros && (
            <button onClick={limpiarFiltros}
              className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-md border border-red-200 hover:bg-red-50 transition-colors">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Toggle: Stats / Detalle */}
      <div className="flex items-center gap-2">
        <button onClick={() => setVerStats(false)}
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${!verStats ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
          Detalle de Sanciones
        </button>
        <button onClick={() => setVerStats(true)}
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${verStats ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
          Resumen por Empleado
        </button>
        <span className="text-xs text-gray-400 ml-auto">
          {verStats ? `${filteredStats.length} empleados` : `${filteredSanciones.length} registros`}
        </span>
      </div>

      {/* === STATS TABLE === */}
      {verStats && (
        filteredStats.length === 0 ? (
          <div className="text-center py-12 border border-gray-200 rounded-lg">
            <FileText className="h-12 w-12 mx-auto text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">{tieneFiltros ? 'No hay resultados para los filtros aplicados' : 'No hay sanciones registradas'}</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 w-12">#</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Operador</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-28">Sanciones</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-40">Ultima Sancion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredStats.map((stat, idx) => (
                    <tr key={stat.codigoEmp} className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => { setFiltroNombre(stat.nombre.split(' ').slice(0, 2).join(' ')); setVerStats(false); }}>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${idx < 3 ? 'bg-red-500' : 'bg-gray-300'}`}>{idx + 1}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-gray-800 text-sm">{stat.nombre}</p>
                        <p className="text-[11px] text-gray-400">{stat.codigoEmp} &middot; {stat.empresa}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="inline-flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full w-7 h-7">{stat.totalSanciones}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-500">{stat.ultimaSancion.replace('T', ' ').slice(0, 16)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* === DETAIL TABLE (unified) === */}
      {!verStats && (
        filteredSanciones.length === 0 ? (
          <div className="text-center py-12 border border-gray-200 rounded-lg">
            <FileText className="h-12 w-12 mx-auto text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">{tieneFiltros ? 'No hay resultados para los filtros aplicados' : 'No hay sanciones registradas'}</p>
            <p className="text-gray-300 text-xs mt-1">Las sanciones se generan desde las pestanas de excesos</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Fecha Hecho</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Operador</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Empresa</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Tipo</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center">Salida</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center">Entrada</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right">Duracion</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right w-20">Sanc.</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center w-32">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSanciones.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 text-gray-600 text-xs">{s.fecha}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => openProfile(s.codigoEmp)} className="font-semibold text-gray-800 text-xs hover:underline text-left">
                          {s.nombre}
                        </button>
                        <p className="text-[10px] text-gray-400">{s.codigoEmp}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{s.empresa}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${tipoColors[s.tipo] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {s.tipoLabel || s.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-xs text-red-600 font-medium">{s.salida}</td>
                      <td className="px-3 py-2 text-center font-mono text-xs text-emerald-600 font-medium">{s.entrada}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono text-xs font-bold ${durTextColor(s.duracionSegundos)}`}>{s.duracion}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full w-6 h-6">
                          {countByEmp[s.codigoEmp] || 1}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => onPrint(s.id)}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
                            title="Imprimir Pedido de Explicacion">
                            <Printer className="h-3 w-3" /> Imprimir
                          </button>
                          <button onClick={() => { if (confirm('Eliminar esta sancion?')) onDelete(s.id); }}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-1 rounded bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-600 border border-gray-200 hover:border-red-200 transition-colors"
                            title="Eliminar sancion">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
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