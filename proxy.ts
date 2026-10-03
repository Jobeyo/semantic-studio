import { auth } from '@/auth';
import { NextResponse } from 'next/server';

// All åtkomst till Studio passerar här.
//
// Roller:
//   viewer – får läsa, och byta sitt eget lösenord
//   editor – får dessutom skapa och ändra modeller, vyer, termer, ontologi och kvalitetsregler, generera med AI och publicera
//   admin  – får dessutom hantera användare, AI-leverantörer och agentinställningar, ta bort modeller
//            och byta namn på eller ta bort scheman i databasen
// Att ändra en befintlig modells anslutning kräver admin och kontrolleras i /api/models/[id].
//
// Interna anrop från Klarify identifieras med INTERNAL_API_KEY i headern x-internal-key och får bara läsa.

type Role = 'viewer' | 'editor' | 'admin';
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

const INTERNAL_READ = [
  /^\/api\/models(\/.*)?$/,
  /^\/api\/glossary$/,
  /^\/api\/ontology\/context$/,
  /^\/api\/governance\/lineage$/,
];

function requiredRole(method: string, path: string): Role {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'viewer';
  if (path === '/api/user/password') return 'viewer';
  if (path.startsWith('/api/users') || path.startsWith('/api/llm-providers') || path.startsWith('/api/agent-config')) return 'admin';
  if (method === 'DELETE' && /^\/api\/models\/\d+$/.test(path)) return 'admin';
  if (/^\/api\/models\/\d+\/schema$/.test(path)) return 'admin';
  return 'editor';
}

const deny = (status: number, error: string) => NextResponse.json({ error }, { status });

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const method = req.method;
  const isApi = pathname.startsWith('/api/');

  if (pathname.startsWith('/api/auth') || pathname.startsWith('/api/setup') || pathname === '/setup') {
    return NextResponse.next();
  }

  // Interna anrop: rätt nyckel, bara läsning, bara de adresser Klarify behöver
  const sentKey = req.headers.get('x-internal-key');
  if (isApi && sentKey) {
    const key = process.env.INTERNAL_API_KEY;
    const allowed = !!key && sentKey === key && method === 'GET' && INTERNAL_READ.some(r => r.test(pathname));
    return allowed ? NextResponse.next() : deny(401, 'Unauthorized');
  }

  const isLoggedIn = !!req.auth;
  if (!isLoggedIn) {
    if (isApi) return deny(401, 'Unauthorized');
    if (pathname !== '/login') return NextResponse.redirect(new URL('/login', req.url));
    return NextResponse.next();
  }
  if (pathname === '/login') return NextResponse.redirect(new URL('/', req.url));

  if (isApi) {
    const raw = (req.auth?.user as { role?: string } | undefined)?.role;
    const role: Role = raw === 'admin' ? 'admin' : raw === 'editor' ? 'editor' : 'viewer';
    const need = requiredRole(method, pathname);
    if (RANK[role] < RANK[need]) {
      return deny(403, need === 'admin' ? 'Det här kräver rollen Admin' : 'Du har läsbehörighet och kan inte ändra');
    }
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
