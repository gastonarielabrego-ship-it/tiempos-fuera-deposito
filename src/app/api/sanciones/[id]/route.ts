import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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