'use client';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layers, Home, Database, GitBranch, Settings, LogOut, BookOpen, History, Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { language, setLanguage } = useLanguage();
  const { data: session } = useSession();
  const pathname = usePathname();
  const name = session?.user?.name ?? '';
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'U';

  const navItems = [
    { href: '/', label: 'Översikt', icon: Home },
    { href: '/models', label: 'Modeller', icon: Database },
    { href: '/glossary', label: 'Glossary', icon: BookOpen },
    { href: '/changelog', label: 'Ändringslogg', icon: History },
    { href: '/connections', label: 'Anslutningar', icon: GitBranch },
    { href: '/settings', label: 'Inställningar', icon: Settings },
  ];
  if (pathname === '/login') {
    return (
      <div className="h-full flex">
        <div className="w-56 bg-slate-800 flex flex-col h-full flex-shrink-0">
          <div className="flex items-center gap-2.5 px-4 py-5 border-b border-slate-700">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Semantic Studio</p>
              <p className="text-slate-400 text-xs">by Klarify</p>
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1 opacity-60">
            {navItems.map(({ href, label, icon: Icon }) => (
              <div key={href} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white">
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </div>
            ))}
          </nav>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    );
  }


  return (
    <div className="h-full flex">
      <div className="w-56 bg-slate-900 flex flex-col h-full flex-shrink-0">
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-slate-700">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Semantic Studio</p>
            <p className="text-slate-400 text-xs">by Klarify</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
          <button onClick={() => signOut()}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors text-slate-300 hover:bg-slate-800 hover:text-white">
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Logga ut
          </button>
        </nav>
        <div className="px-3 py-4 border-t border-slate-700 space-y-1">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-7 h-7 bg-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-white">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{name}</p>
              <p className="text-slate-400 text-xs truncate">{session?.user?.email}</p>
            </div>
          </div>

        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
