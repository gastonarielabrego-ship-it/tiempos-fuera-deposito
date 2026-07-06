import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const type = req.nextUrl.searchParams.get('type');

    const result = await db.execute({
      sql: 'SELECT * FROM Sancion WHERE id = ? LIMIT 1',
      args: [id],
    });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: 'Sancion no encontrada' }, { status: 404 });

    const codigoEmp = String(row.codigoEmp ?? '');
    const nombre = String(row.nombre ?? '').toUpperCase();
    const fecha = String(row.fecha ?? '');

    if (type === 'facial') {
      const r = await db.execute({
        sql: 'SELECT hora, zona FROM FacialRecord WHERE persona = ? AND fecha = ? ORDER BY hora ASC',
        args: [nombre, fecha],
      });
      return NextResponse.json(r.rows);
    }

    if (type === 'comida') {
      const r = await db.execute({
        sql: 'SELECT hora FROM MealRecord WHERE nombre = ? AND fecha = ? ORDER BY hora ASC',
        args: [nombre, fecha],
      });
      return NextResponse.json(r.rows.map((x: Record<string, unknown>) => x.hora));
    }

    // Default: access records
    const r = await db.execute({
      sql: 'SELECT hora, terminal FROM AccessRecord WHERE codigoEmp = ? AND fecha = ? ORDER BY hora ASC',
      args: [codigoEmp, fecha],
    });
    return NextResponse.json(r.rows);
  } catch (error) {
    console.error('Error fetching movimientos:', error);
    return NextResponse.json({ error: 'Error al obtener movimientos' }, { status: 500 });
  }
}