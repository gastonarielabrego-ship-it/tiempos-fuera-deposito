/**
 * Impresion de "Pedido de Explicacion" para una sancion.
 * Compartido entre la pagina principal (tab Sanciones) y el perfil de operador.
 */

export async function printSancionById(
  id: string,
  notify?: (message: string, type: 'success' | 'error') => void
): Promise<void> {
  try {
    const [sancionR, movR] = await Promise.all([
      window.fetch(`/api/sanciones/${id}`),
      window.fetch(`/api/sanciones/${id}/movimientos`),
    ]);
    if (!sancionR.ok) { notify?.('Error al obtener sancion', 'error'); return; }
    const sancion = await sancionR.json();
    const movRows: { fecha: string; hora: string; evento: string; tipo: string; duracion: string; entradaHora?: string; duracionSegundos?: number }[] = movR.ok ? await movR.json() : [];

    const isMultiple = sancion.tipo === 'multiple-salidas';

    // Pairs come pre-computed from /movimientos, which applies the SAME pairing
    // algorithm as the dashboard (each Entrada Depo consumed exactly once,
    // TN shift window + 6h gap rules). No re-pairing here.
    const pairRows = movRows
      .filter(m => m.tipo === 'Acceso' && m.evento.toLowerCase().includes('salida') && !!m.entradaHora)
      .map(m => ({
        fecha: m.fecha,
        salida: m.hora,
        entrada: m.entradaHora || '',
        duracion: m.duracion || '00:00:00',
        duracionSegs: m.duracionSegundos || 0,
      }));
    const totalAccSecs = pairRows.reduce((s, p) => s + p.duracionSegs, 0);
    const totalAccH = Math.floor(totalAccSecs / 3600);
    const totalAccM = Math.floor((totalAccSecs % 3600) / 60);
    const totalAccS = totalAccSecs % 60;
    const totalAccStr = `${String(totalAccH).padStart(2, '0')}:${String(totalAccM).padStart(2, '0')}:${String(totalAccS).padStart(2, '0')}`;

    // Count counted (paired) exits per day
    const exitsByDay: Record<string, number> = {};
    for (const p of pairRows) {
      exitsByDay[p.fecha] = (exitsByDay[p.fecha] || 0) + 1;
    }
    const exitsByDayStr = Object.entries(exitsByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, count]) => `${fecha}: ${count} salida${count > 1 ? 's' : ''}`)
      .join(' | ');

    const today = new Date().toISOString().split('T')[0];
    const [yr, mo, dy] = today.split('-');

    const win = window.open('', '_blank', 'width=800,height=1000');
    if (!win) { notify?.('Permite ventanas emergentes para imprimir', 'error'); return; }

    // Build the movements table rows - only Acceso (salida/entrada) with duration
    const movTableRows = movRows
      .map((m, i) => {
        const isSalida = m.tipo === 'Acceso' && m.evento.toLowerCase().includes('salida');
        const isEntrada = m.tipo === 'Acceso' && m.evento.toLowerCase().includes('entrada');
        const bgStyle = isSalida ? 'background:#FFF3CD;' : isEntrada ? 'background:#D1ECF1;' : '';
        const durCell = isSalida ? `<td style="${bgStyle}">${m.duracion || '-'}</td>` : '<td></td>';
        return `<tr style="${bgStyle}"><td>${i + 1}</td><td>${m.fecha}</td><td>${m.hora}</td><td>${m.evento}</td><td>${m.tipo}</td>${durCell}</tr>`;
      }).join('');

    // Build paired exit table for multiple-salidas
    const pairTableRows = pairRows.map((p, i) =>
      `<tr><td>${i + 1}</td><td>${p.fecha}</td><td>${p.salida}</td><td>${p.entrada}</td><td style="font-weight:bold;">${p.duracion}</td></tr>`
    ).join('');

    // Build incidence description
    const incidenceDesc = isMultiple
      ? `El colaborador ${sancion.nombre} (Legajo ${sancion.codigoEmp}), empleado de ${sancion.empresa}, sector ${sancion.sector}, registro ${pairRows.length === 1 ? 'una salida' : 'multiples salidas'} del deposito sin justificacion, acumulando un tiempo total fuera de deposito de <b>${totalAccStr}</b> en ${pairRows.length} salida${pairRows.length > 1 ? 's' : ''}. ${exitsByDayStr ? 'Distribucion por dia: ' + exitsByDayStr + '.' : ''} Dicho exceso fue detectado mediante el sistema de control de accesos (molinetes).`
      : `El colaborador ${sancion.nombre} (Legajo ${sancion.codigoEmp}), empleado de ${sancion.empresa}, sector ${sancion.sector}, registro una salida del deposito a las ${sancion.salida} hs y un reingreso a las ${sancion.entrada} hs del dia ${sancion.fecha}, generando un tiempo fuera de deposito de ${sancion.duracion}, superando el tiempo maximo permitido para el periodo correspondiente. Dicho exceso fue detectado mediante el sistema de control de accesos (molinetes).`;

    // Build incidence detail section
    const incidenceDetail = isMultiple
      ? `Colaborador: ${sancion.nombre} (Legajo: ${sancion.codigoEmp})<br>
      Empresa: ${sancion.empresa} | Sector: ${sancion.sector}<br>
      Total de salidas: ${pairRows.length}<br>
      Tiempo acumulado fuera de deposito: <b>${totalAccStr}</b><br>
      ${exitsByDayStr ? 'Salidas por dia: ' + exitsByDayStr + '<br>' : ''}
      Exceso supera el maximo permitido.`
      : `Colaborador: ${sancion.nombre} (Legajo: ${sancion.codigoEmp})<br>
      Empresa: ${sancion.empresa} | Sector: ${sancion.sector}<br>
      Fecha del hecho: ${sancion.fecha}<br>
      Salida del deposito: ${sancion.salida} hs<br>
      Reingreso al deposito: ${sancion.entrada} hs<br>
      Tiempo fuera de deposito: ${sancion.duracion}<br>
      Exceso supera el maximo permitido.`;

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
  .mov-table { font-size: 8pt; width: 100%; margin-top: 6px; }
  .mov-table th { background: #DDD; font-size: 8pt; }
  .mov-table td, .mov-table th { padding: 2px 4px; }
  .pair-table { font-size: 8pt; width: 100%; margin-top: 4px; }
  .pair-table th { background: #E8D5F5; font-size: 8pt; }
  .pair-table td, .pair-table th { padding: 2px 4px; }
  .total-row { background: #F8D7DA !important; font-weight: bold; font-size: 9pt; }
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

<!-- ====== HOJA 1: EVIDENCIA ====== -->
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
      ${incidenceDetail}
    </td>
  </tr>
</table>

<div class="box-section">
  <h3>Evidencia del Caso</h3>
  <table><tr><td style="min-height:100px; vertical-align:top; padding: 6px;">
    ${incidenceDesc}
    ${isMultiple && pairRows.length > 0 ? `
    <br><br>
    <table class="pair-table">
      <tr><th>#</th><th>Fecha</th><th>Salida Depo</th><th>Entrada Depo</th><th>Tiempo Fuera</th></tr>
      ${pairTableRows}
      <tr class="total-row"><td colspan="4" style="text-align:right;">TIEMPO ACUMULADO TOTAL:</td><td>${totalAccStr}</td></tr>
    </table>` : ''}
    ${!isMultiple ? `
    <table class="mov-table" style="margin-top:6px;">
      <tr><th>#</th><th>Fecha</th><th>Hora</th><th>Evento / Movimiento</th><th>Tipo</th><th>Tiempo</th></tr>
      ${movTableRows}
    </table>` : `
    <br><br>
    <table class="mov-table">
      <tr><th>#</th><th>Fecha</th><th>Hora</th><th>Evento / Movimiento</th><th>Tipo</th><th>Tiempo</th></tr>
      ${movTableRows}
    </table>`}
  </td></tr></table>
</div>

<!-- ====== HOJA 2: DESCARGOS Y FIRMAS ====== -->
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
    notify?.('Error al imprimir', 'error');
  }
}
