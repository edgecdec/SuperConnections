import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { serialize } from 'cookie';

export function middleware(request: any) {
  const response = NextResponse.next();
  const userId = request.cookies.get('super_connections_id');

  if (!userId) {
    const newId = uuidv4();
    response.cookies.set('super_connections_id', newId, {
      path: '/',
      httpOnly: false, // Need to access from socket.io-client headers if possible or just rely on cookie header
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  return response;
}

export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
};
