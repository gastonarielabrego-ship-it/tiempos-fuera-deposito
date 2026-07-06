import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await db.execute({
      sql: 'SELECT * FROM Sancion WHERE id = ? LIMIT 1',
      args: [id],
    });

    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: 'Sancion no encontrada' }, { status: 404 });

    const sancion = {
      id: String(row.id ?? ''), codigoEmp: Number(row.codigoEmp ?? 0),
      nombre: String(row.nombre ?? ''), empresa: String(row.empresa ?? ''),
      sector: String(row.sector ?? ''), jornada: String(row.jornada ?? ''),
      fecha: String(row.fecha ?? ''), salida: String(row.salida ?? ''),
      entrada: String(row.entrada ?? ''), duracion: String(row.duracion ?? ''),
      duracionSegundos: Number(row.duracionSegundos ?? 0),
      tipo: String(row.tipo ?? ''), tipoLabel: String(row.tipoLabel ?? ''),
      createdAt: String(row.createdAt ?? ''),
    };

    const movResult = await db.execute({
      sql: 'SELECT hora, terminal FROM AccessRecord WHERE codigoEmp = ? AND fecha = ? ORDER BY hora ASC',
      args: [String(sancion.codigoEmp), sancion.fecha],
    });
    const movimientos = movResult.rows.map((r: Record<string, unknown>) => ({ hora: String(r.hora ?? ''), terminal: String(r.terminal ?? '') }));

    const facialResult = await db.execute({
      sql: 'SELECT hora, zona FROM FacialRecord WHERE persona = ? AND fecha = ? ORDER BY hora ASC',
      args: [sancion.nombre.toUpperCase(), sancion.fecha],
    });
    const faciales = facialResult.rows.map((r: Record<string, unknown>) => ({ hora: String(r.hora ?? ''), zona: String(r.zona ?? '') }));

    const comidaResult = await db.execute({
      sql: 'SELECT hora FROM MealRecord WHERE nombre = ? AND fecha = ? ORDER BY hora ASC',
      args: [sancion.nombre.toUpperCase(), sancion.fecha],
    });
    const comidas = comidaResult.rows.map((r: Record<string, unknown>) => String(r.hora ?? ''));

    const countResult = await db.execute({ sql: 'SELECT COUNT(*) as total FROM Sancion WHERE codigoEmp = ?', args: [String(sancion.codigoEmp)] });
    const sancionNumber = Number((countResult.rows[0] as Record<string, unknown>)?.total ?? 1);

    const pdfBuffer = await generatePDF({ ...sancion, movimientos, faciales, comidas, sancionNumber });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Pedido_Explicacion_${sancion.nombre.replace(/\s+/g, '_')}_${sancion.fecha}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error printing sancion:', error);
    return NextResponse.json({ error: 'Error generando PDF', detail: String(error) }, { status: 500 });
  }
}

async function generatePDF(d: Record<string, unknown>): Promise<Buffer> {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Images
  const headerImgBytes = readFileSync(join(process.cwd(), 'public', 'template_header.png'));
  const footerImgBytes = readFileSync(join(process.cwd(), 'public', 'template_footer.png'));
  const headerImg = await pdfDoc.embedPng(headerImgBytes);
  const footerImg = await pdfDoc.embedPng(footerImgBytes);

  // A4
  const pw = 595.28;
  const ph = 841.89;
  const mx = 40;
  const cw = pw - mx * 2;

  // Color: 0-255 → 0-1
  const c = (r: number, g: number, b: number) => rgb(r / 255, g / 255, b / 255);

  // Text wrap helper
  const wrap = (text: string, sz: number, maxW: number): string[] => {
    if (!text) return [];
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(t, sz) > maxW && cur) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // Draw header image on a page, returns y below it
  const drawHeader = (page: import('pdf-lib').PDFPage) => {
    const w = 380;
    const h = (headerImg.height / headerImg.width) * w;
    page.drawImage(headerImg, { x: mx, y: ph - mx - h, width: w, height: h });
    return ph - mx - h - 10;
  };

  // Draw footer image
  const drawFooter = (page: import('pdf-lib').PDFPage) => {
    const w = 515;
    const h = (footerImg.height / footerImg.width) * w;
    page.drawImage(footerImg, { x: mx, y: mx - 12, width: w, height: h });
  };

  // Draw bordered text box
  const drawBox = (page: import('pdf-lib').PDFPage, text: string, x: number, y: number, w: number, h: number) => {
    page.drawRectangle({ x, y, width: w, height: h, borderColor: c(0, 0, 0), borderWidth: 0.75 });
    if (!text) return;
    const lines = wrap(text, 9, w - 14);
    const lh = 13;
    let ty = y + h - 14;
    for (const line of lines) {
      if (ty < y + 6) break;
      page.drawText(line, { x: x + 7, y: ty, size: 9, font, color: c(0, 0, 0) });
      ty -= lh;
    }
  };

  // ─── PAGE 1 ─────────────────────────────────────────────────────────
  const p1 = pdfDoc.addPage([pw, ph]);
  let y = drawHeader(p1);

  // Title
  const title = 'PEDIDO DE EXPLICACION';
  page1drawTitle(p1, title, pw, y, fontBold, c);
  y -= 22;

  // Table: Datos
  y = drawDatosTable(p1, mx, y, cw, d, font, fontBold, c);

  // Table: Fecha
  y = drawFechaTable(p1, mx, y, cw, font, c);

  // Table: Incidencia
  y = drawIncidenciaTable(p1, mx, y, cw, d, font, fontBold, c);

  // Evidence box
  const evidText = buildEvidenceText(d);
  y -= 6;
  const evidH = 140;
  p1.drawText('Evidencia del Caso', { x: mx, y: y, size: 12, font: fontBold, color: c(0, 0, 0) });
  y -= 6;

  // Evidence border box
  p1.drawRectangle({ x: mx, y: y - evidH, width: cw, height: evidH, borderColor: c(0, 0, 0), borderWidth: 0.75 });

  // Evidence text
  const evidLines = wrap(evidText, 9, cw - 14);
  let ey = y - 14;
  for (const line of evidLines) {
    if (ey < y - evidH + 4) break;
    p1.drawText(line, { x: mx + 7, y: ey, size: 9, font, color: c(0, 0, 0) });
    ey -= 12;
  }

  // Movements mini-table inside evidence
  const allMov = buildAllMovements(d);
  if (allMov.length > 0) {
    drawMovementsTable(p1, mx + 14, y - evidH + 8, allMov, font, fontBold, c);
  }

  drawFooter(p1);

  // ─── PAGE 2 ────────────────────────────────────────────────────────
  const p2 = pdfDoc.addPage([pw, ph]);
  y = drawHeader(p2);
  y -= 10;

  // Comentarios del Colaborador
  p2.drawText('Comentarios del Colaborador', { x: mx, y: y, size: 12, font: fontBold, color: c(0, 0, 0) });
  y -= 6;
  drawBox(p2, '', mx, y - 160, cw, 160);
  y -= 172;

  // Comentarios del Coordinador
  p2.drawText('Comentarios del Coordinador', { x: mx, y: y, size: 12, font: fontBold, color: c(0, 0, 0) });
  y -= 6;
  drawBox(p2, '', mx, y - 120, cw, 120);
  y -= 132;

  // Sugerencias/Mejora / Compromiso
  p2.drawText('Sugerencias/Mejora / Compromiso', { x: mx, y: y, size: 12, font: fontBold, color: c(0, 0, 0) });
  y -= 6;
  drawBox(p2, '', mx, y - 100, cw, 100);
  y -= 120;

  // Signatures
  const sigH = 50;
  const sigY = y - sigH;
  const sigCW = cw / 3;
  p2.drawRectangle({ x: mx, y: sigY, width: cw, height: sigH, borderColor: c(0, 0, 0), borderWidth: 0.75 });
  p2.drawLine({ start: { x: mx + sigCW, y: sigY }, end: { x: mx + sigCW, y: sigY + sigH }, thickness: 0.75, color: c(0, 0, 0) });
  p2.drawLine({ start: { x: mx + sigCW * 2, y: sigY }, end: { x: mx + sigCW * 2, y: sigY + sigH }, thickness: 0.75, color: c(0, 0, 0) });

  const sigLabels = ['Firma de Colaborador', 'Firma del Coordinador', 'Firma de RR.HH.'];
  sigLabels.forEach((label, i) => {
    const lw = font.widthOfTextAtSize(label, 9);
    p2.drawText(label, { x: mx + sigCW * i + (sigCW - lw) / 2, y: sigY + 8, size: 9, font, color: c(0, 0, 0) });
  });

  drawFooter(p2);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ─── Sub-drawing functions (pure, no side effects) ────────────────────

function page1drawTitle(page: import('pdf-lib').PDFPage, title: string, pw: number, y: number, fontBold: any, c: (r: number, g: number, b: number) => any) {
  const tw = fontBold.widthOfTextAtSize(title, 14);
  page.drawText(title, { x: (pw - tw) / 2, y: y - 4, size: 14, font: fontBold, color: c(0, 0, 0) });
}

function drawDatosTable(page: import('pdf-lib').PDFPage, x: number, y: number, w: number, d: Record<string, unknown>, font: any, fontBold: any, c: (r: number, g: number, b: number) => any): number {
  const rowH = [22, 20, 20, 20, 20, 20];
  const totalH = rowH.reduce((a, b) => a + b, 0);
  const top = y - totalH;

  // Border
  page.drawRectangle({ x, y: top, width: w, height: totalH, borderColor: c(0, 0, 0), borderWidth: 0.75 });

  // Header row bg
  page.drawRectangle({ x, y: top, width: w, height: rowH[0], color: c(200, 200, 200) });
  page.drawLine({ start: { x, y: top + rowH[0] }, end: { x: x + w, y: top + rowH[0] }, thickness: 0.75, color: c(0, 0, 0) });

  // Header text
  page.drawText('Datos del Colaborador', { x: x + 6, y: top + 6, size: 10, font: fontBold, color: c(0, 0, 0) });
  page.drawText('Datos de Coordinadores', { x: x + w / 2 + 6, y: top + 6, size: 10, font: fontBold, color: c(0, 0, 0) });

  // Column divider
  page.drawLine({ start: { x: x + w / 2, y: top }, end: { x: x + w / 2, y: top + totalH }, thickness: 0.75, color: c(0, 0, 0) });

  // Row dividers
  let ry = top + rowH[0];
  for (let i = 1; i < 5; i++) { ry += rowH[i]; page.drawLine({ start: { x, y: ry }, end: { x: x + w, y: ry }, thickness: 0.75, color: c(0, 0, 0) }); }

  // Data
  const left = [
    { l: 'Apellido y Nombre:', v: String(d.nombre) },
    { l: 'Legajo:', v: String(d.codigoEmp) },
    { l: 'Sector:', v: 'PREPARACION' },
    { l: 'Funcion:', v: 'PREPARADOR' },
    { l: 'Turno:', v: String(d.jornada) },
  ];
  const right = [
    { l: 'Apellido y Nombre:', v: '' },
    { l: 'Sector:', v: '' },
    { l: 'Interviene por RR.HH.', v: '' },
    { l: 'Apellido y Nombre:', v: '' },
    { l: '', v: '' },
  ];

  let dy = top + rowH[0] + rowH[1] - 6;
  for (let i = 0; i < 5; i++) {
    page.drawText(left[i].l, { x: x + 6, y: dy, size: 10, font, color: c(0, 0, 0) });
    if (left[i].v) page.drawText(left[i].v, { x: x + 6 + font.widthOfTextAtSize(left[i].l + ' ', 10), y: dy, size: 10, font, color: c(0, 0, 0) });
    if (right[i].l) page.drawText(right[i].l, { x: x + w / 2 + 6, y: dy, size: 10, font, color: c(0, 0, 0) });
    if (right[i].v) page.drawText(right[i].v, { x: x + w / 2 + 6 + font.widthOfTextAtSize(right[i].l + ' ', 10), y: dy, size: 10, font, color: c(0, 0, 0) });
    dy -= rowH[i + 1];
  }

  return top - 10;
}

function drawFechaTable(page: import('pdf-lib').PDFPage, x: number, y: number, w: number, font: any, c: (r: number, g: number, b: number) => any): number {
  const h = 24;
  page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: c(0, 0, 0), borderWidth: 0.75 });
  const today = new Date().toISOString().split('T')[0];
  const [yr, mo, dy2] = today.split('-');
  page.drawText(`Fecha: ${dy2} / ${mo} / ${yr}`, { x: x + 6, y: y - h + 7, size: 10, font, color: c(0, 0, 0) });
  return y - h - 10;
}

function drawIncidenciaTable(page: import('pdf-lib').PDFPage, x: number, y: number, w: number, d: Record<string, unknown>, font: any, fontBold: any, c: (r: number, g: number, b: number) => any): number {
  const colW = [w * 0.42, w * 0.58];
  const h1 = 22;
  const h2 = 80;
  const totalH = h1 + h2;

  // Border
  page.drawRectangle({ x, y: y - totalH, width: w, height: totalH, borderColor: c(0, 0, 0), borderWidth: 0.75 });

  // Header bg + text
  page.drawRectangle({ x, y: y - h1, width: w, height: h1, color: c(200, 200, 200) });
  page.drawLine({ start: { x, y: y - h1 }, end: { x: x + w, y: y - h1 }, thickness: 0.75, color: c(0, 0, 0) });
  page.drawText('Incidencia Proceso Operaciones', { x: x + 6, y: y - h1 + 6, size: 12, font: fontBold, color: c(0, 0, 0) });

  // Column divider
  page.drawLine({ start: { x: x + colW[0], y: y - totalH }, end: { x: x + colW[0], y: y }, thickness: 0.75, color: c(0, 0, 0) });

  // Left: tipo
  const tipoText = String(d.tipoLabel || d.tipo || '').toUpperCase();
  page.drawText(tipoText, { x: x + 6, y: y - h1 - 8, size: 10, font, color: c(0, 0, 0) });

  // Right: summary
  const summary = [
    `Colaborador: ${d.nombre} (Legajo: ${d.codigoEmp})`,
    `Empresa: ${d.empresa} | Sector: ${d.sector}`,
    `Fecha del hecho: ${d.fecha}`,
    `Salida del deposito: ${d.salida} hs`,
    `Reingreso al deposito: ${d.entrada} hs`,
    `Tiempo fuera de deposito: ${d.duracion}`,
    `Exceso supera el maximo permitido.`,
  ];
  let sy = y - h1 - 8;
  for (const line of summary) {
    page.drawText(line, { x: x + colW[0] + 6, y: sy, size: 9, font, color: c(0, 0, 0) });
    sy -= 11;
  }

  return y - totalH - 10;
}

function buildEvidenceText(d: Record<string, unknown>): string {
  return `El colaborador ${d.nombre} (Legajo ${d.codigoEmp}), empleado de ${d.empresa}, sector ${d.sector}, registro una salida del deposito a las ${d.salida} hs y un reingreso a las ${d.entrada} hs del dia ${d.fecha}, generando un tiempo fuera de deposito de ${d.duracion}, superando el tiempo maximo permitido para el periodo correspondiente. Dicho exceso fue detectado mediante el sistema de control de accesos (molinetes).`;
}

function buildAllMovements(d: Record<string, unknown>): { hora: string; evento: string; tipo: string }[] {
  return [
    ...(d.movimientos as { hora: string; terminal: string }[]).map(m => ({ hora: m.hora, evento: m.terminal, tipo: 'Acceso' })),
    ...(d.faciales as { hora: string; zona: string }[]).map(f => ({ hora: f.hora, evento: f.zona || 'Facial', tipo: 'Facial' })),
    ...(d.comidas as string[]).map(h => ({ hora: h, evento: 'TK Comida', tipo: 'Comida' })),
  ].sort((a, b) => {
    const pa = a.hora.split(':').map(Number);
    const pb = b.hora.split(':').map(Number);
    return (pa[0] * 3600 + pa[1] * 60 + (pa[2] || 0)) - (pb[0] * 3600 + pb[1] * 60 + (pb[2] || 0));
  });
}

function drawMovementsTable(page: import('pdf-lib').PDFPage, x: number, y: number, movs: { hora: string; evento: string; tipo: string }[], font: any, fontBold: any, c: (r: number, g: number, b: number) => any) {
  const colW = [25, 50, 180, 65];
  const rh = 12;
  const tw = colW.reduce((a, b) => a + b, 0);
  const th = (movs.length + 1) * rh;

  // Header bg
  page.drawRectangle({ x, y: y - th, width: tw, height: rh, color: c(220, 220, 220) });
  page.drawRectangle({ x, y: y - th, width: tw, height: th, borderColor: c(100, 100, 100), borderWidth: 0.5 });

  const headers = ['#', 'Hora', 'Evento', 'Tipo'];
  let hx = x + 2;
  headers.forEach((h, i) => {
    page.drawText(h, { x: hx, y: y - rh + 3, size: 7, font: fontBold, color: c(50, 50, 50) });
    hx += colW[i];
  });

  // Rows
  for (let i = 0; i < movs.length; i++) {
    const ry = y - rh * (i + 1);
    page.drawLine({ start: { x, y: ry }, end: { x: x + tw, y: ry }, thickness: 0.3, color: c(150, 150, 150) });

    const m = movs[i];
    let rx = x + 2;
    page.drawText(String(i + 1), { x: rx, y: ry + 3, size: 7, font, color: c(60, 60, 60) });
    rx += colW[0];
    page.drawText(m.hora, { x: rx, y: ry + 3, size: 7, font, color: c(60, 60, 60) });
    rx += colW[1];
    page.drawText(m.evento, { x: rx, y: ry + 3, size: 7, font, color: c(60, 60, 60) });
    rx += colW[2];
    let tc: [number, number, number] = [120, 120, 120];
    if (m.tipo === 'Acceso') tc = m.evento.includes('Salida') ? [180, 0, 0] : [0, 120, 0];
    else if (m.tipo === 'Facial') tc = [0, 0, 180];
    else if (m.tipo === 'Comida') tc = [180, 100, 0];
    page.drawText(m.tipo, { x: rx, y: ry + 3, size: 7, font, color: c(tc[0], tc[1], tc[2]) });
  }
}