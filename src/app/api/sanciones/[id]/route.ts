import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await db.execute({ sql: 'SELECT * FROM Sancion WHERE id = ? LIMIT 1', args: [id] });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: 'Sancion no encontrada' }, { status: 404 });
    return NextResponse.json({
      id: String(row.id ?? ''), codigoEmp: Number(row.codigoEmp ?? 0),
      nombre: String(row.nombre ?? ''), empresa: String(row.empresa ?? ''),
      sector: String(row.sector ?? ''), jornada: String(row.jornada ?? ''),
      fecha: String(row.fecha ?? ''), salida: String(row.salida ?? ''),
      entrada: String(row.entrada ?? ''), duracion: String(row.duracion ?? ''),
      duracionSegundos: Number(row.duracionSegundos ?? 0),
      tipo: String(row.tipo ?? ''), tipoLabel: String(row.tipoLabel ?? ''),
      createdAt: String(row.createdAt ?? ''),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Error obteniendo sancion' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.execute({ sql: 'DELETE FROM Sancion WHERE id = ?', args: [id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting sancion:', error);
    return NextResponse.json({ error: 'Error eliminando sancion', detail: String(error) }, { status: 500 });
  }
}