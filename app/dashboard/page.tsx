'use client';
import { useSession } from 'next-auth/react';
import { Database, GitBranch, BookOpen, History, Plus, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { data: session } = useSession();
  const name = session?.user?.name?.split(' ')[0] ?? '';

  const cards = [
    { title: 'Modeller', description: 'Skapa och hantera semantiska modeller', href: '/models', icon: Database, color: 'bg-indigo-50 text-indigo-600', count: null },
    { title: 'Anslutningar', description: 'Konfigurera databaskopplingar', href: '/connections', icon: GitBranch, color: 'bg-blue-50 text-blue-600', count: null },
    { title: 'Glossary', description: 'Affärstermer och definitioner', href: '/glossary', icon: BookOpen, color: 'bg-green-50 text-green-600', count: null },
    { title: 'Ändringslogg', description: 'Se vad som ändrats och av vem', href: '/history', icon: History, color: 'bg-amber-50 text-amber-600', count: null },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-6 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-semibold text-gray-900">Välkommen{name ? `, ${name}` : ''}!</h1>
        <p className="text-sm text-gray-500 mt-1">Semantic Studio – din plats för att bygga och hantera semantiska modeller</p>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="grid grid-cols-2 gap-4 max-w-3xl">
          {cards.map(({ title, description, href, icon: Icon, color }) => (
            <Link key={href} href={href}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
              <p className="text-sm text-gray-500">{description}</p>
            </Link>
          ))}
        </div>

        <div className="mt-8 max-w-3xl">
          <div className="bg-indigo-600 rounded-xl p-6 flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold mb-1">Skapa din första modell</h3>
              <p className="text-indigo-200 text-sm">Anslut till en databas och låt AI hjälpa dig bygga det semantiska lagret</p>
            </div>
            <Link href="/models/new"
              className="flex items-center gap-2 bg-white text-indigo-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors flex-shrink-0">
              <Plus className="w-4 h-4" />
              Ny modell
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
