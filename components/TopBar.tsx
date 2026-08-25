'use client';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect } from 'react';

export default function TopBar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { language, setLanguage } = useLanguage();

  const name = (session?.user as any)?.name?.split(' ')[0] ?? session?.user?.email ?? 'Admin';
  const [activeLLM, setActiveLLM] = useState<string | null>(null);

  function fetchLLM() {
    fetch('/api/llm-providers')
      .then(r => r.json())
      .then((providers: any[]) => {
        const def = providers.find((p: any) => p.isDefault || p.is_default);
        if (def) setActiveLLM(`${def.name}${def.config?.model ? ' · ' + def.config.model : ''}`);
      }).catch(() => {});
  }

  useEffect(() => {
    fetchLLM();
    // Uppdatera var 5:e sekund så att byten slår igenom snabbt
    const interval = setInterval(fetchLLM, 5000);
    return () => clearInterval(interval);
  }, []);
  const [subtitleCount, setSubtitleCount] = useState<string>('');

  useEffect(() => {
    setSubtitleCount('');
    if (pathname === '/models') {
      fetch('/api/models').then(r => r.json()).then(m => setSubtitleCount(Array.isArray(m) ? `${m.length} modell${m.length !== 1 ? 'er' : ''}` : '')).catch(() => {});
    } else if (pathname === '/glossary') {
      fetch('/api/glossary').then(r => r.json()).then(d => setSubtitleCount(Array.isArray(d) ? `${d.length} termer definierade` : '')).catch(() => {});
    } else if (pathname === '/changelog') {
      fetch('/api/changelog').then(r => r.json()).then(d => setSubtitleCount(Array.isArray(d) ? `${d.length} händelser` : '')).catch(() => {});
    } else if (pathname === '/connections') {
      fetch('/api/models').then(r => r.json()).then(m => setSubtitleCount(Array.isArray(m) ? `${m.length} anslutning${m.length !== 1 ? 'ar' : ''} från befintliga modeller` : '')).catch(() => {});
    }
  }, [pathname]);
  const initials = ((session?.user as any)?.name || session?.user?.email || 'A')
    .split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  function getTitle() {
    if (pathname === '/') return 'Semantic Studio';
    if (pathname === '/models') return 'Modeller';
    if (pathname.startsWith('/models/') && pathname.includes('/views/')) return 'Vy';
    if (pathname.startsWith('/models/')) return 'Modell';
    if (pathname === '/glossary') return 'Business Glossary';
    if (pathname === '/changelog') return 'Ändringslogg';
    if (pathname === '/connections') return 'Anslutningar';
    if (pathname === '/settings') return 'Inställningar';
    return 'Semantic Studio';
  }

  function getSubtitle() {
    if (pathname === '/') return `Välkommen, ${name}! · Din plats för att bygga och hantera semantiska modeller`;
    return subtitleCount;
  }

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{getTitle()}</h1>
        {getSubtitle() && <p className="text-sm text-gray-500 mt-0.5">{getSubtitle()}</p>}
      </div>
      <div className="flex items-center gap-3">
        {activeLLM && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block flex-shrink-0" />
            {activeLLM}
          </span>
        )}

        <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setLanguage('sv')}
            className={`px-2 py-1.5 text-sm transition-colors ${language === 'sv' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-50 text-gray-600'}`}
            title="Svenska">🇸🇪</button>
          <button onClick={() => setLanguage('en')}
            className={`px-2 py-1.5 text-sm transition-colors ${language === 'en' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-50 text-gray-600'}`}
            title="English">🇬🇧</button>
        </div>
        <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
          <span className="text-xs font-medium text-white">{initials}</span>
        </div>
      </div>
    </div>
  );
}
