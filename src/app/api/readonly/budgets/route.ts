import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth, corsHeaders } from '../middleware';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authError = await withApiAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') ||
      new Date().toISOString().slice(0, 7);

    const db = getDb();

    const budgets = db.prepare(`
      SELECT
        id, category, limit, month,
        (SELECT COALESCE(SUM(amount), 0)
         FROM transactions
         WHERE category = budgets.category
         AND strftime('%Y-%m', date) = ?
         AND type = 'expense') as spent
      FROM budgets
      WHERE month = ?
      ORDER BY category
    `).all(month, month) as any[];

    const enriched = budgets.map(b => ({
      ...b,
      remaining: Math.max(0, b.limit - b.spent)
    }));

    return NextResponse.json(
      {
        success: true,
        data: enriched,
        timestamp: new Date().toISOString()
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Error fetching budgets:', error);
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
