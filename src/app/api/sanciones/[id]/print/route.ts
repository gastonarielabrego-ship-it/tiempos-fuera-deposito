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

    const docxBuffer = await generateDocx({ ...sancion, movimientos, faciales, comidas, sancionNumber });

    const filename = `Pedido_Explicacion_${sancion.nombre.replace(/\s+/g, '_')}_${sancion.fecha}.docx`;
    return new NextResponse(docxBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error generando documento:', error);
    return NextResponse.json({ error: 'Error generando documento', detail: String(error) }, { status: 500 });
  }
}

// ─── DOCX Generator ────────────────────────────────────────────────────────────

async function generateDocx(d: Record<string, unknown>): Promise<Buffer> {
  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell,
    TextRun, WidthType, BorderStyle, AlignmentType,
    ImageRun, Header, Footer, PageBreak, VerticalAlign,
    ShadingType, TableLayoutType, convertInchesToTwip,
  } = await import('docx');

  // Load images
  const headerImgBuf = readFileSync(join(process.cwd(), 'public', 'template_header.png'));
  const footerImgBuf = readFileSync(join(process.cwd(), 'public', 'template_footer.png'));

  const headerImg = new ImageRun({
    data: headerImgBuf,
    transformation: { width: 520, height: 120 },
    type: 'png',
  });

  const footerImg = new ImageRun({
    data: footerImgBuf,
    transformation: { width: 700, height: 210 },
    type: 'png',
  });

  // Borders for tables
  const cellBorder = {
    top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  };

  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  // Shading
  const grayShading = { type: ShadingType.CLEAR, fill: 'C8C8C8' };
  const noShading = { type: ShadingType.CLEAR, fill: 'FFFFFF' };

  // Cell helpers
  const headerCell = (text: string, width: number) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: cellBorder,
    shading: grayShading,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text, bold: true, size: 20, font: 'Calibri' })],
    })],
  });

  const dataCell = (runs: (TextRun | string)[], width: number, opts?: { bold?: boolean; shading?: typeof grayShading }) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: cellBorder,
    shading: opts?.shading || noShading,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      spacing: { before: 30, after: 30 },
      children: runs.map(r => typeof r === 'string' ? new TextRun({ text: r, size: 20, font: 'Calibri', bold: opts?.bold }) : r),
    })],
  });

  const emptyCell = (width: number) => dataCell([''], width);

  // Label run
  const label = (text: string) => new TextRun({ text, bold: true, size: 20, font: 'Calibri' });
  const value = (text: string) => new TextRun({ text, size: 20, font: 'Calibri' });
  const labelVal = (l: string, v: string) => [label(l + ' '), value(v || '-')];

  // Table column widths (DXA = twentieths of a point)
  const halfW = 4500;
  const fullW = 9000;

  // Evidence text
  const evidencia = `El colaborador ${d.nombre} (Legajo ${d.codigoEmp}), empleado de ${d.empresa}, sector ${d.sector}, registro una salida del deposito a las ${d.salida} hs y un reingreso a las ${d.entrada} hs del dia ${d.fecha}, generando un tiempo fuera de deposito de ${d.duracion}, superando el tiempo maximo permitido para el periodo correspondiente. Dicho exceso fue detectado mediante el sistema de control de accesos (molinetes).`;

  // Build movements text
  const allMov = [
    ...(d.movimientos as { hora: string; terminal: string }[]).map(m => `${m.hora} - ${m.terminal} (Acceso)`),
    ...(d.faciales as { hora: string; zona: string }[]).map(f => `${f.hora} - ${f.zona || 'Facial'} (Facial)`),
    ...(d.comidas as string[]).map(h => `${h} - TK Comida (Comida)`),
  ].sort();

  const movText = allMov.length > 0
    ? 'Movimientos del dia:\n' + allMov.map((m, i) => `  ${i + 1}. ${m}`).join('\n')
    : 'Sin movimientos registrados.';

  const today = new Date().toISOString().split('T')[0];
  const [yr, mo, dy] = today.split('-');

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [
      {
        headers: {
          default: new Header({
            children: [new Paragraph({
              children: [headerImg],
              spacing: { after: 0 },
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              children: [footerImg],
              spacing: { before: 0, after: 0 },
            })],
          }),
        },
        children: [
          // Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 200 },
            children: [new TextRun({ text: 'PEDIDO DE EXPLICACION', bold: true, size: 28, font: 'Calibri' })],
          }),

          // ── Table 0: Datos del Colaborador | Datos de Coordinadores ──
          new Table({
            width: { size: fullW, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            rows: [
              new TableRow({
                children: [
                  headerCell('Datos del Colaborador', halfW),
                  headerCell('Datos de Coordinadores', halfW),
                ],
              }),
              new TableRow({
                children: [
                  dataCell(labelVal('Apellido y Nombre:', String(d.nombre)), halfW),
                  dataCell(labelVal('Apellido y Nombre:', ''), halfW),
                ],
              }),
              new TableRow({
                children: [
                  dataCell(labelVal('Legajo:', String(d.codigoEmp)), halfW),
                  dataCell(labelVal('Sector:', ''), halfW),
                ],
              }),
              new TableRow({
                children: [
                  dataCell(labelVal('Sector:', 'PREPARACION'), halfW),
                  dataCell([label('Interviene por RR.HH. ')], halfW),
                ],
              }),
              new TableRow({
                children: [
                  dataCell(labelVal('Funcion:', 'PREPARADOR'), halfW),
                  dataCell(labelVal('Apellido y Nombre:', ''), halfW),
                ],
              }),
              new TableRow({
                children: [
                  dataCell(labelVal('Turno:', String(d.jornada)), halfW),
                  emptyCell(halfW),
                ],
              }),
            ],
          }),

          // Spacer
          new Paragraph({ spacing: { before: 100, after: 0 }, children: [] }),

          // ── Table 1: Fecha ──
          new Table({
            width: { size: fullW, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: fullW, type: WidthType.DXA },
                    borders: cellBorder,
                    children: [new Paragraph({
                      spacing: { before: 40, after: 40 },
                      children: [new TextRun({ text: `Fecha: ${dy} / ${mo} / ${yr}`, size: 20, font: 'Calibri' })],
                    })],
                  }),
                ],
              }),
            ],
          }),

          // Spacer
          new Paragraph({ spacing: { before: 100, after: 0 }, children: [] }),

          // ── Table 2: Incidencia Proceso Operaciones ──
          new Table({
            width: { size: fullW, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: fullW, type: WidthType.DXA },
                    borders: cellBorder,
                    shading: grayShading,
                    columnSpan: 2,
                    children: [new Paragraph({
                      spacing: { before: 40, after: 40 },
                      children: [new TextRun({ text: 'Incidencia Proceso Operaciones', bold: true, size: 24, font: 'Calibri' })],
                    })],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  dataCell([value(String(d.tipoLabel || d.tipo || '').toUpperCase())], 3800),
                  dataCell([
                    value(`Colaborador: ${d.nombre} (Legajo: ${d.codigoEmp})`),
                    new TextRun({ text: '', break: 1, size: 20 }),
                    value(`Empresa: ${d.empresa} | Sector: ${d.sector}`),
                    new TextRun({ text: '', break: 1, size: 20 }),
                    value(`Fecha del hecho: ${d.fecha}`),
                    new TextRun({ text: '', break: 1, size: 20 }),
                    value(`Salida del deposito: ${d.salida} hs`),
                    new TextRun({ text: '', break: 1, size: 20 }),
                    value(`Reingreso al deposito: ${d.entrada} hs`),
                    new TextRun({ text: '', break: 1, size: 20 }),
                    value(`Tiempo fuera de deposito: ${d.duracion}`),
                    new TextRun({ text: '', break: 1, size: 20 }),
                    value('Exceso supera el maximo permitido.'),
                  ], 5200),
                ],
              }),
            ],
          }),

          // Spacer
          new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }),

          // ── Section: Evidencia del Caso ──
          new Paragraph({
            spacing: { before: 100, after: 100 },
            children: [new TextRun({ text: 'Evidencia del Caso', bold: true, size: 24, font: 'Calibri' })],
          }),
          new Table({
            width: { size: fullW, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            rows: [
              new TableRow({
                height: { value: 3600, rule: 'atLeast' as any },
                children: [
                  new TableCell({
                    width: { size: fullW, type: WidthType.DXA },
                    borders: cellBorder,
                    children: [
                      new Paragraph({
                        spacing: { before: 60, after: 60 },
                        children: [new TextRun({ text: evidencia, size: 20, font: 'Calibri' })],
                      }),
                      new Paragraph({ spacing: { before: 100, after: 60 }, children: [new TextRun({ text: movText, size: 18, font: 'Calibri', color: '444444' })] }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          // Page break
          new Paragraph({ children: [new PageBreak()] }),

          // ── PAGE 2: Comentarios ──

          // Comentarios del Colaborador
          new Paragraph({
            spacing: { before: 100, after: 100 },
            children: [new TextRun({ text: 'Comentarios del Colaborador', bold: true, size: 24, font: 'Calibri' })],
          }),
          new Table({
            width: { size: fullW, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            rows: [
              new TableRow({
                height: { value: 4000, rule: 'atLeast' as any },
                children: [
                  new TableCell({
                    width: { size: fullW, type: WidthType.DXA },
                    borders: cellBorder,
                    children: [new Paragraph({ children: [] })],
                  }),
                ],
              }),
            ],
          }),

          // Spacer
          new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }),

          // Comentarios del Coordinador
          new Paragraph({
            spacing: { before: 100, after: 100 },
            children: [new TextRun({ text: 'Comentarios del Coordinador', bold: true, size: 24, font: 'Calibri' })],
          }),
          new Table({
            width: { size: fullW, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            rows: [
              new TableRow({
                height: { value: 3000, rule: 'atLeast' as any },
                children: [
                  new TableCell({
                    width: { size: fullW, type: WidthType.DXA },
                    borders: cellBorder,
                    children: [new Paragraph({ children: [] })],
                  }),
                ],
              }),
            ],
          }),

          // Spacer
          new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }),

          // Sugerencias/Mejora / Compromiso
          new Paragraph({
            spacing: { before: 100, after: 100 },
            children: [new TextRun({ text: 'Sugerencias/Mejora / Compromiso', bold: true, size: 24, font: 'Calibri' })],
          }),
          new Table({
            width: { size: fullW, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            rows: [
              new TableRow({
                height: { value: 2400, rule: 'atLeast' as any },
                children: [
                  new TableCell({
                    width: { size: fullW, type: WidthType.DXA },
                    borders: cellBorder,
                    children: [new Paragraph({ children: [] })],
                  }),
                ],
              }),
            ],
          }),

          // Spacer
          new Paragraph({ spacing: { before: 300, after: 0 }, children: [] }),

          // ── Signatures Table ──
          new Table({
            width: { size: fullW, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            rows: [
              new TableRow({
                height: { value: 1200, rule: 'atLeast' as any },
                children: [
                  new TableCell({
                    width: { size: 3000, type: WidthType.DXA },
                    borders: cellBorder,
                    verticalAlign: VerticalAlign.BOTTOM,
                    children: [new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 40, after: 40 },
                      children: [new TextRun({ text: 'Firma de Colaborador', size: 20, font: 'Calibri' })],
                    })],
                  }),
                  new TableCell({
                    width: { size: 3000, type: WidthType.DXA },
                    borders: cellBorder,
                    verticalAlign: VerticalAlign.BOTTOM,
                    children: [new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 40, after: 40 },
                      children: [new TextRun({ text: 'Firma del Coordinador', size: 20, font: 'Calibri' })],
                    })],
                  }),
                  new TableCell({
                    width: { size: 3000, type: WidthType.DXA },
                    borders: cellBorder,
                    verticalAlign: VerticalAlign.BOTTOM,
                    children: [new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 40, after: 40 },
                      children: [new TextRun({ text: 'Firma de RR.HH.', size: 20, font: 'Calibri' })],
                    })],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}