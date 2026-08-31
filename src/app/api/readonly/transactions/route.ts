import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth, corsHeaders } from '../middleware';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authError = await withApiAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200);

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

    return NextResponse.json(
      {
        success: true,
        data: transactions,
        timestamp: new Date().toISOString()
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders()
  });
}
