'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Upload, RefreshCw, Clock, Users, UtensilsCrossed, ScanFace,
  FileSpreadsheet, ChevronDown, ChevronUp, AlertTriangle, Search,
  Trophy, Medal, UserCircle, ArrowUpFromLine, ArrowDownToLine,
  TrendingUp, CalendarDays, Eye,
} from 'lucide-react';
import WorkerProfileDialog from '@/components/worker-profile-dialog';

/* ────────────── Types ────────────── */

interface TimeOutPair {
  salida: string; entrada: string; duracionSegundos: number; duracion: string;
}
interface AccesoEvento { hora: string; terminal: string; }
interface EmployeeDay {
  codigoEmp: number; nombre: string; fecha: string; jornada: string; sector: string; empresa: string;
  tiemposFuera: TimeOutPair[]; totalFueraSegundos: number; totalFuera: string;
  comidasHoras: string[]; facialRegistros: { hora: string; zona: string }[];
  accesosEventos: AccesoEvento[];
}
interface RankingEntry {
  codigoEmp: number; nombre: string; empresa: string; sector: string;
  totalFueraSegundos: number; totalFuera: string;
  diasCount: number; avgPorDia: string; maxDiaFuera: string; maxDiaFecha: string;
}
interface Summary {
  totalEmployees: number; totalRecords: number; totalComidas: number;
  totalFacial: number; avgOutsidePerEmployee: string; dates: string[];
}
interface DashboardData {
  employees: EmployeeDay[]; ranking: RankingEntry[]; turnos: string[]; summary: Summary;
}

/* ────────────── Helpers ────────────── */

const getDurationColor = (seconds: number) => {
  if (seconds <= 1800) return 'text-green-600 bg-green-50';
  if (seconds <= 3600) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
};

const medalColors = ['text-amber-500', 'text-gray-400', 'text-amber-700'];

/* ────────────── Component ────────────── */

export default function Home() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [selectedTurno, setSelectedTurno] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'tabla' | 'ranking'>('tabla');
  const [profileCodigoEmp, setProfileCodigoEmp] = useState<number | null>(null);

  const fileInputAccesos = useRef<HTMLInputElement>(null);
  const fileInputComidas = useRef<HTMLInputElement>(null);
  const fileInputFacial = useRef<HTMLInputElement>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const data = await res.json();
        setDashboard(data);
      }
    } catch (err) {
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const uploadFile = async (endpoint: string, file: File, label: string) => {
    setUploading(label);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(endpoint, { method: 'POST', body: formData });
      if (res.ok) await fetchDashboard();
    } catch (err) {
      console.error(`Error uploading ${label}:`, err);
    } finally {
      setUploading(null);
    }
  };

  const handleFileChange = (endpoint: string, label: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { uploadFile(endpoint, file, label); e.target.value = ''; }
  };

  /* ── Filtering ── */
  const filteredEmployees = useMemo(() => {
    return (dashboard?.employees || []).filter((emp) => {
      const matchesSearch =
        !searchTerm ||
        emp.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(emp.codigoEmp).includes(searchTerm);
      const matchesDate = selectedDate === 'all' || emp.fecha === selectedDate;
      const matchesTurno = selectedTurno === 'all' || emp.jornada === selectedTurno;
      return matchesSearch && matchesDate && matchesTurno;
    });
  }, [dashboard, searchTerm, selectedDate, selectedTurno]);

  const filteredRanking = useMemo(() => {
    if (!dashboard?.ranking) return [];
    const filteredCodes = new Set(filteredEmployees.map(e => e.codigoEmp));
    return dashboard.ranking.filter(r => filteredCodes.has(r.codigoEmp));
  }, [dashboard, filteredEmployees]);

  /* ── Employee name map for profile dialog ── */
  const allEmployeeNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const emp of dashboard?.employees || []) {
      if (!map.has(emp.codigoEmp)) map.set(emp.codigoEmp, emp.nombre);
    }
    return map;
  }, [dashboard]);

  /* ── Grouped by date for tabla view ── */
  const groupedByDate = useMemo(() => {
    return filteredEmployees.reduce<Record<string, EmployeeDay[]>>((acc, emp) => {
      if (!acc[emp.fecha]) acc[emp.fecha] = [];
      acc[emp.fecha].push(emp);
      return acc;
    }, {});
  }, [filteredEmployees]);

  const handleOpenProfile = (codigoEmp: number) => {
    setProfileCodigoEmp(codigoEmp);
  };

  /* ══════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-600 p-2 rounded-lg">
                <Clock className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Tiempos Fuera de Deposito</h1>
                <p className="text-sm text-gray-500">Control de accesos en tiempo real</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'tabla' | 'ranking')}>
                <TabsList className="h-9">
                  <TabsTrigger value="tabla" className="text-xs px-3">
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Tabla
                  </TabsTrigger>
                  <TabsTrigger value="ranking" className="text-xs px-3">
                    <Trophy className="h-3.5 w-3.5 mr-1.5" /> Ranking
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button onClick={fetchDashboard} disabled={loading} variant="outline" size="sm">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-6 space-y-6">
        {/* ── Upload Section ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4" /> Carga de Archivos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Accesos upload */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors cursor-pointer"
                onClick={() => fileInputAccesos.current?.click()}
              >
                <FileSpreadsheet className="h-8 w-8 mx-auto text-emerald-600 mb-2" />
                <p className="text-sm font-medium text-gray-700">Accesos</p>
                <p className="text-xs text-gray-400 mt-1">
                  {uploading === 'accesos' ? 'Procesando...' : 'Click para subir .xlsx'}
                </p>
                <input ref={fileInputAccesos} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={handleFileChange('/api/upload-accesos', 'accesos')} />
              </div>
              {/* Comidas upload */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-orange-400 hover:bg-orange-50/50 transition-colors cursor-pointer"
                onClick={() => fileInputComidas.current?.click()}
              >
                <UtensilsCrossed className="h-8 w-8 mx-auto text-orange-500 mb-2" />
                <p className="text-sm font-medium text-gray-700">Comidas (TK)</p>
                <p className="text-xs text-gray-400 mt-1">
                  {uploading === 'comidas' ? 'Procesando...' : 'Click para subir .xlsx'}
                </p>
                <input ref={fileInputComidas} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={handleFileChange('/api/upload-comidas', 'comidas')} />
              </div>
              {/* Facial upload */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-pointer"
                onClick={() => fileInputFacial.current?.click()}
              >
                <ScanFace className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                <p className="text-sm font-medium text-gray-700">Facial</p>
                <p className="text-xs text-gray-400 mt-1">
                  {uploading === 'facial' ? 'Procesando...' : 'Click para subir .xlsx'}
                </p>
                <input ref={fileInputFacial} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={handleFileChange('/api/upload-facial', 'facial')} />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Los datos se sobreescriben con cada carga (no se acumulan)
            </p>
          </CardContent>
        </Card>

        {/* ── Summary Cards ── */}
        {dashboard && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Card className="bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="bg-emerald-100 p-2 rounded-lg"><Users className="h-5 w-5 text-emerald-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">Empleados</p>
                  <p className="text-lg font-bold text-gray-900">{dashboard.summary.totalEmployees}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="bg-emerald-100 p-2 rounded-lg"><FileSpreadsheet className="h-5 w-5 text-emerald-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">Reg. Accesos</p>
                  <p className="text-lg font-bold text-gray-900">{dashboard.summary.totalRecords}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="bg-orange-100 p-2 rounded-lg"><UtensilsCrossed className="h-5 w-5 text-orange-500" /></div>
                <div>
                  <p className="text-xs text-gray-500">Reg. Comidas</p>
                  <p className="text-lg font-bold text-gray-900">{dashboard.summary.totalComidas}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg"><ScanFace className="h-5 w-5 text-blue-500" /></div>
                <div>
                  <p className="text-xs text-gray-500">Reg. Facial</p>
                  <p className="text-lg font-bold text-gray-900">{dashboard.summary.totalFacial}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white col-span-2 sm:col-span-1">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="bg-amber-100 p-2 rounded-lg"><Clock className="h-5 w-5 text-amber-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">Prom. Fuera</p>
                  <p className="text-lg font-bold text-gray-900">{dashboard.summary.avgOutsidePerEmployee}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Filters ── */}
        {dashboard && dashboard.summary.dates.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar por nombre o codigo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Turno filters */}
              {dashboard.turnos.length > 0 && (
                <div className="flex items-center gap-2 mr-4">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Turno:</span>
                  <Badge
                    variant={selectedTurno === 'all' ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => setSelectedTurno('all')}
                  >
                    Todos
                  </Badge>
                  {dashboard.turnos.map((t) => (
                    <Badge
                      key={t}
                      variant={selectedTurno === t ? 'default' : 'outline'}
                      className="cursor-pointer select-none"
                      onClick={() => setSelectedTurno(t)}
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              {/* Date filters */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Fecha:</span>
                <Badge
                  variant={selectedDate === 'all' ? 'default' : 'outline'}
                  className="cursor-pointer select-none"
                  onClick={() => setSelectedDate('all')}
                >
                  Todas
                </Badge>
                {dashboard.summary.dates.map((d) => (
                  <Badge
                    key={d}
                    variant={selectedDate === d ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => setSelectedDate(d)}
                  >
                    {d}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            RANKING VIEW
            ══════════════════════════════════════════ */}
        {viewMode === 'ranking' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Ranking — Mayor Tiempo Fuera de Deposito
                {selectedDate !== 'all' && (
                  <Badge variant="outline" className="text-xs ml-2">{selectedDate}</Badge>
                )}
                {selectedTurno !== 'all' && (
                  <Badge variant="outline" className="text-xs">{selectedTurno}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : filteredRanking.length === 0 ? (
                <div className="p-12 text-center">
                  <Trophy className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-600">Sin datos para el filtro seleccionado</h3>
                </div>
              ) : (
                <>
                  {/* Podium for top 3 */}
                  {filteredRanking.length >= 3 && (
                    <div className="px-6 pt-6 pb-2">
                      <div className="flex items-end justify-center gap-4">
                        {/* 2nd place */}
                        <PodiumCard rank={2} entry={filteredRanking[1]} onOpen={handleOpenProfile} />
                        {/* 1st place */}
                        <PodiumCard rank={1} entry={filteredRanking[0]} onOpen={handleOpenProfile} />
                        {/* 3rd place */}
                        <PodiumCard rank={3} entry={filteredRanking[2]} onOpen={handleOpenProfile} />
                      </div>
                    </div>
                  )}

                  {/* Full ranking table */}
                  <ScrollArea className="max-h-[50vh]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-12 text-xs font-semibold text-gray-600">#</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">Codigo</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">Empleado</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 hidden sm:table-cell">Empresa</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">Total Fuera</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-center hidden md:table-cell">Dias</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right hidden md:table-cell">Prom/Dia</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right hidden lg:table-cell">Max Dia</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRanking.map((r, idx) => (
                          <TableRow
                            key={r.codigoEmp}
                            className={`hover:bg-gray-50 cursor-pointer transition-colors ${idx < 3 ? 'bg-amber-50/30' : ''}`}
                            onClick={() => handleOpenProfile(r.codigoEmp)}
                          >
                            <TableCell className="text-center">
                              {idx < 3 ? (
                                <Medal className={`h-5 w-5 mx-auto ${medalColors[idx]}`} />
                              ) : (
                                <span className="text-sm font-bold text-gray-400">{idx + 1}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm font-mono text-gray-500">{r.codigoEmp}</TableCell>
                            <TableCell className="text-sm font-medium text-gray-900 max-w-[200px] truncate">{r.nombre}</TableCell>
                            <TableCell className="text-sm text-gray-500 hidden sm:table-cell max-w-[140px] truncate">{r.empresa}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary" className={`font-mono font-bold ${getDurationColor(r.totalFueraSegundos)}`}>
                                {r.totalFuera}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center hidden md:table-cell">
                              <span className="text-sm text-gray-600">{r.diasCount}</span>
                            </TableCell>
                            <TableCell className="text-right hidden md:table-cell">
                              <span className="text-sm font-mono text-gray-600">{r.avgPorDia}</span>
                            </TableCell>
                            <TableCell className="text-right hidden lg:table-cell">
                              <div className="text-xs">
                                <span className="font-mono text-gray-600">{r.maxDiaFuera}</span>
                                <span className="text-gray-400 ml-1">({r.maxDiaFecha})</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Eye className="h-4 w-4 text-gray-400" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════
            TABLA VIEW
            ══════════════════════════════════════════ */}
        {viewMode === 'tabla' && (
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-4">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !dashboard || filteredEmployees.length === 0 ? (
                <div className="p-12 text-center">
                  <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-600">Sin datos</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Subi los archivos Excel para visualizar los tiempos fuera de deposito
                  </p>
                </div>
              ) : (
                <ScrollArea className="max-h-[70vh]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">Codigo</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">Empleado</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">Fecha</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 hidden sm:table-cell">Turno</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 hidden md:table-cell">Sector</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">T. Fuera Deposito</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-center">TK</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-center">Facial</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(groupedByDate).map(([fecha, emps]) => (
                        <DateGroup key={fecha} fecha={fecha}>
                          {emps.map((emp) => {
                            const rowKey = `${emp.codigoEmp}-${emp.fecha}`;
                            const isExpanded = expandedRow === rowKey;
                            return (
                              <TableRow
                                key={rowKey}
                                className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                                  emp.tiemposFuera.length === 0 ? 'opacity-50' : ''
                                }`}
                                onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                              >
                                <TableCell className="w-8 text-center">
                                  {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                </TableCell>
                                <TableCell className="text-sm font-mono text-gray-500">{emp.codigoEmp}</TableCell>
                                <TableCell className="text-sm font-medium text-gray-900 max-w-[200px] truncate">{emp.nombre}</TableCell>
                                <TableCell className="text-sm text-gray-500">{emp.fecha}</TableCell>
                                <TableCell className="text-sm text-gray-500 hidden sm:table-cell max-w-[120px] truncate">
                                  {emp.jornada ? (
                                    <Badge variant="outline" className="text-[10px] font-normal">{emp.jornada}</Badge>
                                  ) : '—'}
                                </TableCell>
                                <TableCell className="text-sm text-gray-500 hidden md:table-cell max-w-[120px] truncate">{emp.sector}</TableCell>
                                <TableCell>
                                  <div className="space-y-1">
                                    {emp.tiemposFuera.map((t, idx) => (
                                      <div key={idx} className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-gray-500">{t.salida} → {t.entrada}</span>
                                        <Badge variant="secondary" className={`text-xs font-mono font-semibold ${getDurationColor(t.duracionSegundos)}`}>
                                          {t.duracion}
                                        </Badge>
                                      </div>
                                    ))}
                                    {emp.tiemposFuera.length > 1 && !isExpanded && (
                                      <Badge variant="secondary" className={`text-xs font-mono font-bold ${getDurationColor(emp.totalFueraSegundos)}`}>
                                        Total: {emp.totalFuera}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  {emp.comidasHoras.length > 0 ? (
                                    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600 border-orange-200">
                                      TK {emp.comidasHoras.length}x
                                    </Badge>
                                  ) : <span className="text-xs text-gray-300">—</span>}
                                </TableCell>
                                <TableCell className="text-center">
                                  {emp.facialRegistros.length > 0 ? (
                                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                                      {emp.facialRegistros.length} reg.
                                    </Badge>
                                  ) : <span className="text-xs text-gray-300">—</span>}
                                </TableCell>
                                <TableCell>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleOpenProfile(emp.codigoEmp); }}
                                    className="p-1 rounded hover:bg-gray-100 transition-colors"
                                    title="Ver perfil del trabajador"
                                  >
                                    <Eye className="h-4 w-4 text-gray-400 hover:text-emerald-600" />
                                  </button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </DateGroup>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Expanded Detail Panel (Tabla view) ── */}
        {expandedRow && dashboard && viewMode === 'tabla' && (() => {
          const emp = dashboard.employees.find(
            (e) => `${e.codigoEmp}-${e.fecha}` === expandedRow
          );
          if (!emp) return null;
          return (
            <Card className="border-l-4 border-l-emerald-500">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{emp.nombre} — {emp.fecha}</CardTitle>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => handleOpenProfile(emp.codigoEmp)}
                    className="text-xs"
                  >
                    <UserCircle className="h-3.5 w-3.5 mr-1" /> Ver perfil completo
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Jornada</p>
                    <p className="text-sm text-gray-700">{emp.jornada || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Sector</p>
                    <p className="text-sm text-gray-700">{emp.sector || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Empresa</p>
                    <p className="text-sm text-gray-700">{emp.empresa || '—'}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500 font-medium mb-2">Detalle Tiempos Fuera de Deposito</p>
                  {emp.tiemposFuera.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Sin salidas registradas</p>
                  ) : (
                    <div className="space-y-2">
                      {emp.tiemposFuera.map((t, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
                          <div className="flex items-center gap-4">
                            <ArrowUpFromLine className="h-3.5 w-3.5 text-red-500" />
                            <span className="text-sm font-mono text-red-600">{t.salida}</span>
                            <span className="text-gray-300">→</span>
                            <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="text-sm font-mono text-emerald-600">{t.entrada}</span>
                          </div>
                          <Badge variant="secondary" className={`font-mono font-bold ${getDurationColor(t.duracionSegundos)}`}>
                            {t.duracion}
                          </Badge>
                        </div>
                      ))}
                      {emp.tiemposFuera.length > 1 && (
                        <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-4 py-2 border border-emerald-200">
                          <span className="text-sm font-semibold text-emerald-700">Total fuera de deposito</span>
                          <Badge className="bg-emerald-600 text-white font-mono font-bold">{emp.totalFuera}</Badge>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs text-gray-500 font-medium mb-2">TK Comida</p>
                  {emp.comidasHoras.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Sin registros de comida</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {emp.comidasHoras.map((h, idx) => (
                        <Badge key={idx} variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">
                          <UtensilsCrossed className="h-3 w-3 mr-1" /> {h}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs text-gray-500 font-medium mb-2">Registros Faciales</p>
                  {emp.facialRegistros.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Sin registros faciales</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {emp.facialRegistros.map((f, idx) => (
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
              </CardContent>
            </Card>
          );
        })()}
      </main>

      {/* ── Worker Profile Dialog ── */}
      <WorkerProfileDialog
        open={profileCodigoEmp !== null}
        onOpenChange={(open) => { if (!open) setProfileCodigoEmp(null); }}
        codigoEmp={profileCodigoEmp || 0}
        employees={dashboard?.employees || []}
        allEmployeeNames={allEmployeeNames}
      />

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200 bg-white py-3 mt-auto">
        <p className="text-center text-xs text-gray-400">
          Dashboard de Tiempos Fuera de Deposito — Datos actualizables por carga de archivos
        </p>
      </footer>
    </div>
  );
}

/* ────────────── Sub-components ────────────── */

function DateGroup({ fecha, children }: { fecha: string; children: React.ReactNode }) {
  return (
    <>
      <TableRow className="bg-gray-100/80 hover:bg-gray-100/80">
        <TableCell colSpan={10} className="text-xs font-bold text-gray-600 uppercase tracking-wider py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            {fecha}
          </div>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}

function PodiumCard({
  rank, entry, onOpen,
}: {
  rank: number;
  entry: RankingEntry;
  onOpen: (codigo: number) => void;
}) {
  const heights = { 1: 'h-28', 2: 'h-20', 3: 'h-16' };
  const bgColors = { 1: 'from-amber-400 to-amber-500', 2: 'from-gray-300 to-gray-400', 3: 'from-amber-600 to-amber-700' };
  const textColors = { 1: 'text-amber-500', 2: 'text-gray-500', 3: 'text-amber-700' };
  const sizes = { 1: 'w-36', 2: 'w-28', 3: 'w-28' };

  return (
    <div
      className="flex flex-col items-center cursor-pointer group"
      onClick={() => onOpen(entry.codigoEmp)}
    >
      {/* Avatar */}
      <div className={`mb-2 w-12 h-12 rounded-full bg-gradient-to-br ${bgColors[rank]} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
        <span className="text-white font-bold text-lg">{rank}</span>
      </div>
      {/* Name */}
      <p className="text-xs font-semibold text-gray-800 text-center max-w-[130px] truncate">
        {entry.nombre}
      </p>
      {/* Time */}
      <p className={`text-sm font-bold font-mono ${textColors[rank]} mt-0.5`}>
        {entry.totalFuera}
      </p>
      {/* Pedestal */}
      <div className={`${sizes[rank]} ${heights[rank]} bg-gradient-to-b ${bgColors[rank]} rounded-t-lg mt-2 opacity-20`} />
    </div>
  );
}