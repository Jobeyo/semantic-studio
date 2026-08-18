'use client';
import { createContext, useContext, useState, useEffect } from 'react';

type Language = 'sv' | 'en';
interface LanguageContextType { language: Language; setLanguage: (l: Language) => void; }
const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('sv');
  useEffect(() => {
    const saved = localStorage.getItem('studio-language') as Language;
    if (saved === 'sv' || saved === 'en') setLanguageState(saved);
  }, []);
  function setLanguage(l: Language) {
    setLanguageState(l);
    localStorage.setItem('studio-language', l);
  }
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) return { language: 'sv' as Language, setLanguage: (_: Language) => {} };
  return ctx;
}
