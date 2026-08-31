import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey } from '@/lib/api-keys';

export async function withApiAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'Missing Bearer token' },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  const isValid = await verifyApiKey(token);

  if (!isValid) {
    return NextResponse.json(
      { success: false, error: 'Invalid token' },
      { status: 401 }
    );
  }

  return null; // OK
}
