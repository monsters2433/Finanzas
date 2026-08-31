import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/middleware/api-auth';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  // Verificar autenticación
  const authError = await withApiAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 100);

    const db = getDb();
    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params: any[] = [];

    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY date DESC LIMIT ?';
    params.push(limit);

    const transactions = db.prepare(query).all(...params);

    return NextResponse.json({
      success: true,
      data: transactions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    }
  });
}
