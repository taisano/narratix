import { NextResponse } from 'next/server';

/** 今動いている版の ID（開いたままの古いタブが、新しい版が出たかを確かめる） */
export const dynamic = 'force-dynamic';
export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev' }, { headers: { 'Cache-Control': 'no-store' } });
}
