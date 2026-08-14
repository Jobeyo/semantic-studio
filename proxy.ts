import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === '/login';
  const isSetupPage = req.nextUrl.pathname === '/setup';
  const isApiAuth = req.nextUrl.pathname.startsWith('/api/auth');
  const isApiSetup = req.nextUrl.pathname.startsWith('/api/setup');
  if (isApiAuth || isApiSetup) return NextResponse.next();
  if (isSetupPage) return NextResponse.next();
  if (!isLoggedIn && !isLoginPage) return NextResponse.redirect(new URL('/login', req.url));
  if (isLoggedIn && isLoginPage) return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
