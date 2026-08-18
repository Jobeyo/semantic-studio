import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { PageHeaderProvider } from '@/contexts/PageHeaderContext';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Semantic Studio',
  description: 'AI-powered semantic model studio',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className="h-full">
      <body className={`${geist.className} h-full bg-gray-50`}>
        <Providers>
          <LanguageProvider>
            <PageHeaderProvider>{children}</PageHeaderProvider>
          </LanguageProvider>
        </Providers>
      </body>
    </html>
  );
}
