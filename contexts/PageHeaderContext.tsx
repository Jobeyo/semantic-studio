'use client';
import { createContext, useContext, useState } from 'react';

interface PageHeaderContextType {
  title: string;
  subtitle: string;
  setHeader: (title: string, subtitle?: string) => void;
}

const PageHeaderContext = createContext<PageHeaderContextType>({
  title: 'Semantic Studio', subtitle: '', setHeader: () => {}
});

export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');

  function setHeader(t: string, s?: string) {
    setTitle(t);
    setSubtitle(s ?? '');
  }

  return (
    <PageHeaderContext.Provider value={{ title, subtitle, setHeader }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader() {
  return useContext(PageHeaderContext);
}
