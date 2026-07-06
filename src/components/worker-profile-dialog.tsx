'use client';

import { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Clock, Building2, MapPin, CalendarDays, UtensilsCrossed,
  ScanFace, LogIn, LogOut, ArrowDownToLine, ArrowUpFromLine,
} from 'lucide-react';

interface TimeOutPair {
  salida: string;
  entrada: string;
  duracionSegundos: number;
  duracion: string;
}

interface AccesoEvento {
  hora: string;
  terminal: string;
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
  accesosEventos: AccesoEvento[];
}

interface WorkerProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  codigoEmp: number;
  employees: EmployeeDay[];
  allEmployeeNames: Map<number, string>;
}

function timeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return (Number(parts[0]) || 0) * 3600 + (Number(parts[1]) || 0) * 60 + (Number(parts[2]) || 0);
}

function getDurationColor(seconds: number): string {
  if (seconds <= 1800) return 'text-green-600 bg-green-50';
  if (seconds <= 3600) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

function TimelineView({ employee }: { employee: EmployeeDay }) {
  const { accesosEventos, facialRegistros, comidasHoras } = employee;

  // Build all timeline events
  const events = useMemo(() => {
    const list: { hora: string; segundos: number; tipo: 'acceso-entrada' | 'acceso-salida' | 'facial' | 'comida'; label: string; zona?: string }[] = [];

    for (const ev of accesosEventos) {
      const seg = timeToSeconds(ev.hora);
      if (ev.terminal === 'Entrada Depo') {
        list.push({ hora: ev.hora, segundos: seg, tipo: 'acceso-entrada', label: 'Entrada Depo' });
      } else if (ev.terminal === 'Salida Depo') {
        list.push({ hora: ev.hora, segundos: seg, tipo: 'acceso-salida', label: 'Salida Depo' });
      }
    }

    for (const f of facialRegistros) {
      const seg = timeToSeconds(f.hora);
      list.push({ hora: f.hora, segundos: seg, tipo: 'facial', label: f.zona || 'Facial', zona: f.zona });
    }

    for (const h of comidasHoras) {
      const seg = timeToSeconds(h);
      list.push({ hora: h, segundos: seg, tipo: 'comida', label: 'TK Comida' });
    }

    return list.sort((a, b) => a.segundos - b.segundos);
  }, [accesosEventos, facialRegistros, comidasHoras]);

  if (events.length === 0) {
    return <p className="text-sm text-gray-400 italic py-4">Sin eventos para este dia</p>;
  }

  // Determine time range (round to nearest hour)
  const minSec = Math.max(0, Math.floor(events[0].segundos / 3600) * 3600 - 3600);
  const maxSec = Math.min(86400, Math.ceil(events[events.length - 1].segundos / 3600) * 3600 + 3600);
  const range = maxSec - minSec || 1;

  const getLeftPercent = (seg: number) => ((seg - minSec) / range) * 100;

  // Generate hour labels
  const hourLabels: number[] = [];
  for (let h = Math.floor(minSec / 3600); h <= Math.ceil(maxSec / 3600); h++) {
    if (h >= 0 && h <= 24) hourLabels.push(h);
  }

  const getMarkerColor = (tipo: string) => {
    switch (tipo) {
      case 'acceso-entrada': return { bg: 'bg-emerald-500', ring: 'ring-emerald-200', text: 'text-emerald-700', label: 'bg-emerald-50 border-emerald-200' };
      case 'acceso-salida': return { bg: 'bg-red-500', ring: 'ring-red-200', text: 'text-red-700', label: 'bg-red-50 border-red-200' };
      case 'facial': return { bg: 'bg-blue-500', ring: 'ring-blue-200', text: 'text-blue-700', label: 'bg-blue-50 border-blue-200' };
      case 'comida': return { bg: 'bg-orange-500', ring: 'ring-orange-200', text: 'text-orange-700', label: 'bg-orange-50 border-orange-200' };
      default: return { bg: 'bg-gray-500', ring: 'ring-gray-200', text: 'text-gray-700', label: 'bg-gray-50 border-gray-200' };
    }
  };

  const getIcon = (tipo: string) => {
    switch (tipo) {
      case 'acceso-entrada': return <ArrowDownToLine className="h-3 w-3" />;
      case 'acceso-salida': return <ArrowUpFromLine className="h-3 w-3" />;
      case 'facial': return <ScanFace className="h-3 w-3" />;
      case 'comida': return <UtensilsCrossed className="h-3 w-3" />;
      default: return null;
    }
  };

  // Draw "outside" bands (red shaded areas between Salida and Entrada)
  const outsideBands = employee.tiemposFuera.map(t => ({
    left: getLeftPercent(timeToSeconds(t.salida)),
    width: ((timeToSeconds(t.entrada) - timeToSeconds(t.salida) + (timeToSeconds(t.entrada) < timeToSeconds(t.salida) ? 86400 : 0)) / range) * 100,
  }));

  // Cluster events that are very close (within 2% of range) to avoid overlap
  const clusteredEvents = useMemo(() => {
    const clusters: { events: typeof events; position: number }[] = [];
    let currentCluster: typeof events = [];
    let clusterStart = -1;

    for (const ev of events) {
      const pos = getLeftPercent(ev.segundos);
      if (currentCluster.length === 0 || pos - clusterStart < 3) {
        currentCluster.push(ev);
        clusterStart = currentCluster.length === 1 ? pos : clusterStart;
      } else {
        if (currentCluster.length > 0) {
          clusters.push({ events: currentCluster, position: getLeftPercent(currentCluster[0].segundos) });
        }
        currentCluster = [ev];
        clusterStart = pos;
      }
    }
    if (currentCluster.length > 0) {
      clusters.push({ events: currentCluster, position: getLeftPercent(currentCluster[0].segundos) });
    }
    return clusters;
  }, [events, range, minSec]);

  return (
    <div className="space-y-3">
      {/* Timeline bar */}
      <div className="relative">
        {/* Time axis */}
        <div className="relative h-16 bg-gray-50 rounded-lg border border-gray-200 overflow-visible">
          {/* Hour grid lines */}
          {hourLabels.map(h => {
            const left = getLeftPercent(h * 3600);
            if (left < 0 || left > 100) return null;
            return (
              <div
                key={`grid-${h}`}
                className="absolute top-0 bottom-0 border-l border-gray-200/60"
                style={{ left: `${left}%` }}
              >
                <span className="absolute -bottom-5 left-1 text-[10px] text-gray-400 font-mono">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            );
          })}

          {/* Outside-depot shaded bands */}
          {outsideBands.map((band, idx) => (
            <div
              key={`band-${idx}`}
              className="absolute top-0 bottom-0 bg-red-100/50 rounded"
              style={{ left: `${band.left}%`, width: `${Math.min(band.width, 100 - band.left)}%` }}
            />
          ))}

          {/* Event markers */}
          {clusteredEvents.map((cluster, cIdx) => (
            <div
              key={`cluster-${cIdx}`}
              className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${Math.max(1, Math.min(cluster.position, 99))}%`, transform: 'translate(-50%, -50%)' }}
            >
              {cluster.events.map((ev, eIdx) => {
                const colors = getMarkerColor(ev.tipo);
                const offset = eIdx - (cluster.events.length - 1) / 2;
                return (
                  <div
                    key={eIdx}
                    className={`absolute w-5 h-5 ${colors.bg} rounded-full ring-2 ${colors.ring} flex items-center justify-center text-white shadow-sm transition-transform hover:scale-125 cursor-default group`}
                    style={{
                      top: `${offset * 26}px`,
                      zIndex: 10 + eIdx,
                    }}
                    title={`${ev.hora} - ${ev.label}`}
                  >
                    {getIcon(ev.tipo)}
                    {/* Tooltip */}
                    <div className={`absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded text-[10px] font-medium border ${colors.label} ${colors.text} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-sm z-50`}>
                      {ev.hora} — {ev.label}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Time labels below */}
        <div className="relative h-6 mt-1">
          {hourLabels.map(h => {
            const left = getLeftPercent(h * 3600);
            if (left < 0 || left > 100) return null;
            return (
              <div
                key={`label-${h}`}
                className="absolute text-[10px] text-gray-400 font-mono"
                style={{ left: `${left}%`, transform: 'translateX(-50%)' }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-gray-600">Entrada Depo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-gray-600">Salida Depo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-gray-600">Facial</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-orange-500" />
          <span className="text-gray-600">TK Comida</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded bg-red-100 border border-red-200" />
          <span className="text-gray-600">Fuera de Deposito</span>
        </div>
      </div>

      {/* Detailed event list */}
      <div className="space-y-2 mt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Detalle de eventos</p>
        <div className="space-y-1.5">
          {events.map((ev, idx) => {
            const colors = getMarkerColor(ev.tipo);
            return (
              <div
                key={idx}
                className="flex items-center gap-3 px-3 py-1.5 rounded-md bg-gray-50/80 text-sm"
              >
                <span className="font-mono text-xs text-gray-500 w-16 shrink-0">{ev.hora}</span>
                <div className={`w-5 h-5 rounded-full ${colors.bg} flex items-center justify-center text-white shrink-0`}>
                  {getIcon(ev.tipo)}
                </div>
                <span className={`text-xs font-medium ${colors.text}`}>{ev.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function WorkerProfileDialog({
  open, onOpenChange, codigoEmp, employees, allEmployeeNames,
}: WorkerProfileDialogProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Get all days for this employee, sorted desc
  const employeeDays = useMemo(() => {
    return employees
      .filter(e => e.codigoEmp === codigoEmp)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [employees, codigoEmp]);

  const selectedDay = useMemo(() => {
    if (!selectedDate) return employeeDays[0] || null;
    return employeeDays.find(e => e.fecha === selectedDate) || employeeDays[0] || null;
  }, [selectedDate, employeeDays]);

  // Auto-select first date when employee changes
  const empName = allEmployeeNames.get(codigoEmp) || '';
  const empData = employeeDays[0];

  // Navigate between employees
  const empCodes = Array.from(allEmployeeNames.keys()).sort((a, b) => {
    return (allEmployeeNames.get(a) || '').localeCompare(allEmployeeNames.get(b) || '');
  });
  const currentIdx = empCodes.indexOf(codigoEmp);
  const prevEmp = currentIdx > 0 ? empCodes[currentIdx - 1] : null;
  const nextEmp = currentIdx < empCodes.length - 1 ? empCodes[currentIdx + 1] : null;

  if (!empData) return null;

  // Aggregate stats
  const totalDias = employeeDays.length;
  const totalFuera = employeeDays.reduce((s, e) => s + e.totalFueraSegundos, 0);
  const diasConSalida = employeeDays.filter(e => e.tiemposFuera.length > 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 text-white shrink-0">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-white text-lg">{empData.nombre}</DialogTitle>
              <DialogDescription className="text-emerald-100 text-xs">
                Codigo: {codigoEmp} &middot; {empData.empresa} &middot; {empData.sector}
              </DialogDescription>
            </div>
            {/* Employee nav */}
            <div className="flex gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); if (prevEmp) onOpenChange(false); }}
                className="text-emerald-200 hover:text-white p-1 rounded hover:bg-emerald-800/50 transition-colors disabled:opacity-30"
                disabled={!prevEmp}
                title={`Anterior: ${prevEmp ? allEmployeeNames.get(prevEmp) : ''}`}
              >
                <ArrowUpFromLine className="h-4 w-4 rotate-90" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); if (nextEmp) onOpenChange(false); }}
                className="text-emerald-200 hover:text-white p-1 rounded hover:bg-emerald-800/50 transition-colors disabled:opacity-30"
                disabled={!nextEmp}
                title={`Siguiente: ${nextEmp ? allEmployeeNames.get(nextEmp) : ''}`}
              >
                <ArrowDownToLine className="h-4 w-4 rotate-90" />
              </button>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-emerald-100">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{totalDias} dia{totalDias !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-100">
              <Clock className="h-3.5 w-3.5" />
              <span>Total fuera: {(() => { const h = Math.floor(totalFuera / 3600); const m = Math.floor((totalFuera % 3600) / 60); return `${h}h ${m}m`; })()}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-100">
              <LogOut className="h-3.5 w-3.5" />
              <span>{diasConSalida} dia{diasConSalida !== 1 ? 's' : ''} con salida</span>
            </div>
          </div>
        </div>

        {/* Date tabs */}
        <div className="border-b border-gray-200 bg-gray-50 px-4 shrink-0">
          <div className="flex gap-1 overflow-x-auto py-2">
            {employeeDays.map(day => (
              <button
                key={day.fecha}
                onClick={() => setSelectedDate(day.fecha)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedDay?.fecha === day.fecha
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {day.fecha}
                {day.totalFueraSegundos > 0 && (
                  <span className={`ml-1.5 ${selectedDay?.fecha === day.fecha ? 'text-emerald-100' : 'text-gray-400'}`}>
                    ({day.totalFuera})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          {selectedDay && (
            <div className="p-6 space-y-6">
              {/* Day info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Jornada</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selectedDay.jornada || '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Sector</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{selectedDay.sector || '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Total Fuera</p>
                  <p className={`text-sm font-bold font-mono mt-0.5 ${selectedDay.totalFueraSegundos > 0 ? getDurationColor(selectedDay.totalFueraSegundos).split(' ')[0] : 'text-gray-400'}`}>
                    {selectedDay.totalFuera}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Salidas</p>
                  <p className="text-sm font-bold text-gray-700 mt-0.5">{selectedDay.tiemposFuera.length}</p>
                </div>
              </div>

              {/* Time outside detail */}
              {selectedDay.tiemposFuera.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tiempos Fuera de Deposito</p>
                  <div className="space-y-1.5">
                    {selectedDay.tiemposFuera.map((t, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <LogOut className="h-3.5 w-3.5 text-red-500" />
                          <span className="text-sm font-mono text-red-600">{t.salida}</span>
                          <span className="text-gray-300">→</span>
                          <LogIn className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-sm font-mono text-emerald-600">{t.entrada}</span>
                        </div>
                        <Badge
                          variant="secondary"
                          className={`font-mono font-bold ${getDurationColor(t.duracionSegundos)}`}
                        >
                          {t.duracion}
                        </Badge>
                      </div>
                    ))}
                    {selectedDay.tiemposFuera.length > 1 && (
                      <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-4 py-2 border border-emerald-200">
                        <span className="text-sm font-semibold text-emerald-700">Total fuera de deposito</span>
                        <Badge className="bg-emerald-600 text-white font-mono font-bold">
                          {selectedDay.totalFuera}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Linea de Tiempo del Dia</p>
                <TimelineView employee={selectedDay} />
              </div>

              {/* Comidas */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">TK Comida</p>
                {selectedDay.comidasHoras.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Sin registros de comida</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedDay.comidasHoras.map((h, idx) => (
                      <Badge key={idx} variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">
                        <UtensilsCrossed className="h-3 w-3 mr-1" /> {h}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Facial */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Registros Faciales</p>
                {selectedDay.facialRegistros.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Sin registros faciales</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedDay.facialRegistros.map((f, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className={`${
                          f.zona.toLowerCase().includes('entrada')
                            ? 'bg-blue-50 text-blue-600 border-blue-200'
                            : 'bg-purple-50 text-purple-600 border-purple-200'
                        }`}
                      >
                        <ScanFace className="h-3 w-3 mr-1" /> {f.hora} — {f.zona}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}