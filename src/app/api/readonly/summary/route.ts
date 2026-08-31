import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth, corsHeaders } from '../middleware';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authError = await withApiAuth(req);
  if (authError) return authError;

  try {
    const db = getDb();
    const currentMonth = new Date().toISOString().slice(0, 7);

    const income = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = "income"'
    ).get() as any;

    const expenses = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = "expense"'
    ).get() as any;

    const budgetData = db.prepare(`
      SELECT
        COALESCE(SUM(limit), 0) as total_limit,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(amount), 0)
           FROM transactions
           WHERE category = budgets.category
           AND strftime('%Y-%m', date) = ?
           AND type = 'expense')
        ), 0) as total_spent
      FROM budgets
      WHERE month = ?
    `).get(currentMonth, currentMonth) as any;

    const totalIncome = income.total || 0;
    const totalExpenses = expenses.total || 0;
    const balance = totalIncome - totalExpenses;
    const budgetUsage = budgetData.total_limit > 0
      ? budgetData.total_spent / budgetData.total_limit
      : 0;

    return NextResponse.json(
      {
        success: true,
        data: {
          totalIncome,
          totalExpenses,
          balance,
          budgetUsage: Math.min(budgetUsage, 1),
          lastUpdated: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Error fetching summary:', error);
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
