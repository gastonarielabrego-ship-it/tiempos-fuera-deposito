import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get sancion to find employee info
    const sancionResult = await db.execute({
      sql: 'SELECT * FROM Sancion WHERE id = ? LIMIT 1',
      args: [id],
    });
    const row = sancionResult.rows[0] as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: 'Sancion no encontrada' }, { status: 404 });

    const codigoEmp = String(row.codigoEmp ?? '');
    const nombre = String(row.nombre ?? '').toUpperCase();
    const fecha = String(row.fecha ?? '');

    // Try to get dni from AccessRecord
    let dni = '';
    const accResult = await db.execute({
      sql: 'SELECT dni FROM AccessRecord WHERE codigoEmp = ? AND fecha = ? LIMIT 1',
      args: [codigoEmp, fecha],
    });
    if (accResult.rows.length > 0) {
      dni = String((accResult.rows[0] as Record<string, unknown>).dni ?? '').trim();
    }

    // Query AuxRecord by dni only
    const result = dni
      ? await db.execute({
          sql: 'SELECT hora, tipo, detalle FROM AuxRecord WHERE dni = ? AND fecha = ? ORDER BY hora ASC',
          args: [dni, fecha],
        })
      : { rows: [] };

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching movimientos:', error);
    return NextResponse.json({ error: 'Error al obtener movimientos' }, { status: 500 });
  }
}