'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  RefreshCw,
  Clock,
  Users,
  UtensilsCrossed,
  ScanFace,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Search,
} from 'lucide-react';

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

interface Summary {
  totalEmployees: number;
  totalRecords: number;
  totalComidas: number;
  totalFacial: number;
  avgOutsidePerEmployee: string;
  dates: string[];
}

export default function Home() {
  const [dashboard, setDashboard] = useState<{ employees: EmployeeDay[]; summary: Summary } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('all');
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

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const uploadFile = async (endpoint: string, file: File, label: string) => {
    setUploading(label);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(endpoint, { method: 'POST', body: formData });
      if (res.ok) {
        await fetchDashboard();
      }
    } catch (err) {
      console.error(`Error uploading ${label}:`, err);
    } finally {
      setUploading(null);
    }
  };

  const handleFileChange = (endpoint: string, label: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(endpoint, file, label);
      e.target.value = '';
    }
  };

  const filteredEmployees = dashboard?.employees.filter((emp) => {
    const matchesSearch =
      !searchTerm ||
      emp.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(emp.codigoEmp).includes(searchTerm);
    const matchesDate = selectedDate === 'all' || emp.fecha === selectedDate;
    return matchesSearch && matchesDate;
  }) || [];

  // Group by fecha for display
  const groupedByDate = filteredEmployees.reduce<Record<string, EmployeeDay[]>>((acc, emp) => {
    if (!acc[emp.fecha]) acc[emp.fecha] = [];
    acc[emp.fecha].push(emp);
    return acc;
  }, {});

  const getDurationColor = (seconds: number) => {
    if (seconds <= 1800) return 'text-green-600 bg-green-50';
    if (seconds <= 3600) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-600 p-2 rounded-lg">
                <Clock className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Tiempos Fuera de Depósito</h1>
                <p className="text-sm text-gray-500">Control de accesos en tiempo real</p>
              </div>
            </div>
            <Button onClick={fetchDashboard} disabled={loading} variant="outline" size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-6 space-y-6">
        {/* Upload Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Carga de Archivos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors cursor-pointer"
                onClick={() => fileInputAccesos.current?.click()}
              >
                <FileSpreadsheet className="h-8 w-8 mx-auto text-emerald-600 mb-2" />
                <p className="text-sm font-medium text-gray-700">Accesos</p>
                <p className="text-xs text-gray-400 mt-1">
                  {uploading === 'accesos' ? 'Procesando...' : 'Click para subir .xlsx'}
                </p>
                <input
                  ref={fileInputAccesos}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange('/api/upload-accesos', 'accesos')}
                />
              </div>

              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-orange-400 hover:bg-orange-50/50 transition-colors cursor-pointer"
                onClick={() => fileInputComidas.current?.click()}
              >
                <UtensilsCrossed className="h-8 w-8 mx-auto text-orange-500 mb-2" />
                <p className="text-sm font-medium text-gray-700">Comidas (TK)</p>
                <p className="text-xs text-gray-400 mt-1">
                  {uploading === 'comidas' ? 'Procesando...' : 'Click para subir .xlsx'}
                </p>
                <input
                  ref={fileInputComidas}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange('/api/upload-comidas', 'comidas')}
                />
              </div>

              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-pointer"
                onClick={() => fileInputFacial.current?.click()}
              >
                <ScanFace className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                <p className="text-sm font-medium text-gray-700">Facial</p>
                <p className="text-xs text-gray-400 mt-1">
                  {uploading === 'facial' ? 'Procesando...' : 'Click para subir .xlsx'}
                </p>
                <input
                  ref={fileInputFacial}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange('/api/upload-facial', 'facial')}
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Los datos se sobreescriben con cada carga (no se acumulan)
            </p>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {dashboard && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Card className="bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="bg-emerald-100 p-2 rounded-lg">
                  <Users className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Empleados</p>
                  <p className="text-lg font-bold text-gray-900">{dashboard.summary.totalEmployees}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="bg-emerald-100 p-2 rounded-lg">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Reg. Accesos</p>
                  <p className="text-lg font-bold text-gray-900">{dashboard.summary.totalRecords}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="bg-orange-100 p-2 rounded-lg">
                  <UtensilsCrossed className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Reg. Comidas</p>
                  <p className="text-lg font-bold text-gray-900">{dashboard.summary.totalComidas}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <ScanFace className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Reg. Facial</p>
                  <p className="text-lg font-bold text-gray-900">{dashboard.summary.totalFacial}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white col-span-2 sm:col-span-1">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="bg-amber-100 p-2 rounded-lg">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Prom. Fuera</p>
                  <p className="text-lg font-bold text-gray-900">{dashboard.summary.avgOutsidePerEmployee}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        {dashboard && dashboard.summary.dates.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por nombre o código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge
                variant={selectedDate === 'all' ? 'default' : 'outline'}
                className="cursor-pointer select-none"
                onClick={() => setSelectedDate('all')}
              >
                Todas las fechas
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
        )}

        {/* Main Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !dashboard || dashboard.employees.length === 0 ? (
              <div className="p-12 text-center">
                <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-600">Sin datos</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Subí los archivos Excel para visualizar los tiempos fuera de depósito
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-[70vh]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600">Código</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600">Empleado</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600">Fecha</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600">Sector</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600">Tiempos Fuera de Depósito</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600 text-center">TK Comida</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600 text-center">Facial</TableHead>
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
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-gray-400" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-gray-400" />
                                )}
                              </TableCell>
                              <TableCell className="text-sm font-mono text-gray-500">
                                {emp.codigoEmp}
                              </TableCell>
                              <TableCell className="text-sm font-medium text-gray-900 max-w-[200px] truncate">
                                {emp.nombre}
                              </TableCell>
                              <TableCell className="text-sm text-gray-500">{emp.fecha}</TableCell>
                              <TableCell className="text-sm text-gray-500 max-w-[140px] truncate">
                                {emp.sector}
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  {emp.tiemposFuera.map((t, idx) => (
                                    <div key={idx} className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs text-gray-500">
                                        {t.salida} → {t.entrada}
                                      </span>
                                      <Badge
                                        variant="secondary"
                                        className={`text-xs font-mono font-semibold ${getDurationColor(t.duracionSegundos)}`}
                                      >
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
                                ) : (
                                  <span className="text-xs text-gray-300">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {emp.facialRegistros.length > 0 ? (
                                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                                    {emp.facialRegistros.length} reg.
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-gray-300">—</span>
                                )}
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

        {/* Expanded Detail Panel */}
        {expandedRow && dashboard && (() => {
          const emp = dashboard.employees.find(
            (e) => `${e.codigoEmp}-${e.fecha}` === expandedRow
          );
          if (!emp) return null;
          return (
            <Card className="border-l-4 border-l-emerald-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {emp.nombre} — {emp.fecha}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Jornada</p>
                    <p className="text-sm text-gray-700">{emp.jornada}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Sector</p>
                    <p className="text-sm text-gray-700">{emp.sector}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Empresa</p>
                    <p className="text-sm text-gray-700">{emp.empresa}</p>
                  </div>
                </div>

                {/* Time outside detail */}
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-2">Detalle Tiempos Fuera de Depósito</p>
                  {emp.tiemposFuera.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Sin salidas registradas</p>
                  ) : (
                    <div className="space-y-2">
                      {emp.tiemposFuera.map((t, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2"
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-mono text-red-500">{t.salida}</span>
                            <span className="text-gray-300">→</span>
                            <span className="text-sm font-mono text-green-600">{t.entrada}</span>
                          </div>
                          <Badge
                            variant="secondary"
                            className={`font-mono font-bold ${getDurationColor(t.duracionSegundos)}`}
                          >
                            {t.duracion}
                          </Badge>
                        </div>
                      ))}
                      {emp.tiemposFuera.length > 1 && (
                        <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-4 py-2 border border-emerald-200">
                          <span className="text-sm font-semibold text-emerald-700">Total fuera de depósito</span>
                          <Badge className="bg-emerald-600 text-white font-mono font-bold">
                            {emp.totalFuera}
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Comidas detail */}
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

                {/* Facial detail */}
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
                            f.zona.includes('Entrada')
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

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-3 mt-auto">
        <p className="text-center text-xs text-gray-400">
          Dashboard de Tiempos Fuera de Depósito — Datos actualizables por carga de archivos
        </p>
      </footer>
    </div>
  );
}

function DateGroup({ fecha, children }: { fecha: string; children: React.ReactNode }) {
  return (
    <>
      <TableRow className="bg-gray-100/80 hover:bg-gray-100/80">
        <TableCell
          colSpan={8}
          className="text-xs font-bold text-gray-600 uppercase tracking-wider py-2"
        >
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