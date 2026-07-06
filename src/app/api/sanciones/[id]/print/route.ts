import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const contentWidth = width - margin * 2;
  const colWidth = contentWidth / 2;
  let y = height - margin;

  const drawText = (text: string, x: number, yPos: number, size: number, f: typeof font, color?: ReturnType<typeof rgb>) => {
    page.drawText(text, { x, y: yPos, size, font: f, color: color || rgb(0, 0, 0) });
  };
  const drawLine = (x1: number, y1: number, x2: number, y2: number, t = 1, color?: ReturnType<typeof rgb>) => {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color: color || rgb(0, 0, 0) });
  };

  // HEADER
  drawText('PREPARACION', margin, y, 14, fontBold, rgb(80, 80, 80));
  drawText('DEPARTAMENTO DE RECURSOS HUMANOS', margin, y - 16, 9, font, rgb(120, 120, 120));
  y -= 40;
  drawLine(margin, y, width - margin, y, 2);
  y -= 25;

  // TITLE
  const title = 'PEDIDO DE EXPLICACION';
  const tw = fontBold.widthOfTextAtSize(title, 18);
  drawText(title, (width - tw) / 2, y, 18, fontBold, rgb(180, 0, 0));
  y -= 8;
  drawLine(margin, y, width - margin, y, 1.5, rgb(180, 0, 0));
  y -= 10;
  drawText(`Nro. Sancion: ${d.sancionNumber}`, width - margin - font.widthOfTextAtSize(`Nro. Sancion: ${d.sancionNumber}`, 9), y, 9, font, rgb(120, 120, 120));
  y -= 18;

  // TYPE BADGE
  const incidentText = String(d.tipoLabel || d.tipo || '').toUpperCase();
  const iw = fontBold.widthOfTextAtSize(incidentText, 11);
  page.drawRectangle({ x: margin, y: y - 4, width: iw + 20, height: 18, borderColor: rgb(180, 0, 0), borderWidth: 1.5, color: rgb(255, 240, 240) });
  drawText(incidentText, margin + 10, y, 11, fontBold, rgb(180, 0, 0));
  y -= 30;

  // COLLABORATOR DATA
  const fields = [
    ['Nombre y Apellido:', String(d.nombre)],
    ['Codigo:', String(d.codigoEmp)],
    ['Empresa:', String(d.empresa)],
    ['Sector:', String(d.sector)],
    ['Fecha del hecho:', String(d.fecha)],
    ['Jornada:', String(d.jornada)],
  ];
  for (let i = 0; i < fields.length; i += 2) {
    drawText(fields[i][0], margin, y, 9, fontBold, rgb(80, 80, 80));
    drawText(fields[i][1], margin + fontBold.widthOfTextAtSize(fields[i][0] + ' ', 9), y, 10, font, rgb(30, 30, 30));
    if (i + 1 < fields.length) {
      drawText(fields[i + 1][0], margin + colWidth, y, 9, fontBold, rgb(80, 80, 80));
      drawText(fields[i + 1][1], margin + colWidth + fontBold.widthOfTextAtSize(fields[i + 1][0] + ' ', 9), y, 10, font, rgb(30, 30, 30));
    }
    y -= 16;
  }

  y -= 10;
  drawLine(margin, y, width - margin, y, 0.5, rgb(200, 200, 200));
  y -= 15;

  // INCIDENT
  drawText('INCIDENCIA', margin, y, 12, fontBold);
  y -= 18;
  drawText('Tipo de incidencia:', margin, y, 9, fontBold, rgb(80, 80, 80));
  drawText(incidentText, margin + fontBold.widthOfTextAtSize('Tipo de incidencia: ', 9), y, 10, font, rgb(180, 0, 0));
  y -= 16;
  drawText('Fecha del hecho:', margin, y, 9, fontBold, rgb(80, 80, 80));
  drawText(String(d.fecha), margin + fontBold.widthOfTextAtSize('Fecha del hecho: ', 9), y, 10, font);
  y -= 16;
  drawText('Horario de salida del deposito:', margin, y, 9, fontBold, rgb(80, 80, 80));
  drawText(String(d.salida) + ' hs', margin + fontBold.widthOfTextAtSize('Horario de salida del deposito: ', 9), y, 10, font, rgb(180, 0, 0));
  y -= 16;
  drawText('Horario de reingreso al deposito:', margin, y, 9, fontBold, rgb(80, 80, 80));
  drawText(String(d.entrada) + ' hs', margin + fontBold.widthOfTextAtSize('Horario de reingreso al deposito: ', 9), y, 10, font, rgb(0, 120, 0));
  y -= 16;
  drawText('Tiempo fuera de deposito (exceso):', margin, y, 9, fontBold, rgb(80, 80, 80));
  drawText(String(d.duracion), margin + fontBold.widthOfTextAtSize('Tiempo fuera de deposito (exceso): ', 9), y, 10, font, rgb(180, 0, 0));
  y -= 22;
  drawLine(margin, y, width - margin, y, 0.5, rgb(200, 200, 200));
  y -= 15;

  // EVIDENCE
  drawText('EVIDENCIA', margin, y, 12, fontBold);
  y -= 18;
  const evidences = [
    `El colaborador ${d.nombre} (Codigo ${d.codigoEmp}), empleado de ${d.empresa}, sector ${d.sector},`,
    `registro una salida del deposito a las ${d.salida} hs y un reingreso a las ${d.entrada} hs del dia ${d.fecha},`,
    `generando un tiempo fuera de deposito de ${d.duracion}, superando el tiempo maximo permitido para el periodo correspondiente.`,
    `Dicho exceso fue detectado mediante el sistema de control de accesos (molinetes).`,
  ];
  for (const line of evidences) { drawText(line, margin, y, 9, font, rgb(40, 40, 40)); y -= 14; }
  y -= 12;

  // MOVIMIENTOS
  drawText('MOVIMIENTOS DE MOLINETES Y REGISTROS DEL DIA', margin, y, 11, fontBold);
  y -= 18;
  page.drawRectangle({ x: margin, y: y - 4, width: contentWidth, height: 16, color: rgb(240, 240, 240) });
  drawText('#', margin + 5, y, 8, fontBold, rgb(80, 80, 80));
  drawText('Hora', margin + 30, y, 8, fontBold, rgb(80, 80, 80));
  drawText('Evento / Movimiento', margin + 90, y, 8, fontBold, rgb(80, 80, 80));
  drawText('Tipo', margin + 300, y, 8, fontBold, rgb(80, 80, 80));
  y -= 14;
  drawLine(margin, y, width - margin, y, 0.5, rgb(200, 200, 200));
  y -= 4;

  const allMov = [
    ...(d.movimientos as { hora: string; terminal: string }[]).map(m => ({ hora: m.hora, evento: m.terminal, tipo: 'Acceso' })),
    ...(d.faciales as { hora: string; zona: string }[]).map(f => ({ hora: f.hora, evento: f.zona || 'Facial', tipo: 'Facial' })),
    ...(d.comidas as string[]).map(h => ({ hora: h, evento: 'TK Comida', tipo: 'Comida' })),
  ].sort((a: { hora: string }, b: { hora: string }) => {
    const pa = a.hora.split(':').map(Number);
    const pb = b.hora.split(':').map(Number);
    return (pa[0] * 3600 + pa[1] * 60 + (pa[2] || 0)) - (pb[0] * 3600 + pb[1] * 60 + (pb[2] || 0));
  });

  for (let i = 0; i < allMov.length; i++) {
    const m = allMov[i];
    if (y < margin + 160) break;
    drawText(String(i + 1), margin + 5, y, 8, font, rgb(60, 60, 60));
    drawText(m.hora, margin + 30, y, 8, font, rgb(60, 60, 60));
    drawText(m.evento, margin + 90, y, 8, font, rgb(60, 60, 60));
    let tc = rgb(80, 80, 80);
    if (m.tipo === 'Acceso') tc = m.evento.includes('Salida') ? rgb(180, 0, 0) : rgb(0, 120, 0);
    else if (m.tipo === 'Facial') tc = rgb(0, 0, 180);
    else if (m.tipo === 'Comida') tc = rgb(180, 100, 0);
    drawText(m.tipo, margin + 300, y, 8, font, tc);
    y -= 14;
  }

  // SIGNATURES
  y = margin + 110;
  drawLine(margin, y, width - margin, y, 0.5, rgb(200, 200, 200));
  y -= 20;
  drawText('Firma del colaborador:', margin, y, 9, font, rgb(80, 80, 80));
  drawText('Firma del responsable de area:', margin + colWidth, y, 9, font, rgb(80, 80, 80));
  y -= 5;
  drawLine(margin, y, margin + colWidth - 20, y, 0.5, rgb(150, 150, 150));
  drawLine(margin + colWidth, y, width - margin, y, 0.5, rgb(150, 150, 150));
  y -= 15;
  drawText('Aclaracion:', margin, y, 8, font, rgb(120, 120, 120));
  drawText('Aclaracion:', margin + colWidth, y, 8, font, rgb(120, 120, 120));
  y -= 20;
  drawText('Fecha:', margin, y, 8, font, rgb(120, 120, 120));
  drawText('Fecha:', margin + colWidth, y, 8, font, rgb(120, 120, 120));

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}