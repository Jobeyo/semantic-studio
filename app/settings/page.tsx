'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Lock, Loader2, CheckCircle } from 'lucide-react';

export default function SettingsPage() {
  const { data: session } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ok: boolean; message: string} | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setResult({ ok: false, message: 'De nya lösenorden matchar inte' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/user/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: 'Lösenordet har uppdaterats!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setResult({ ok: false, message: data.error });
      }
    } catch {
      setResult({ ok: false, message: 'Något gick fel' });
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-semibold text-gray-900">Inställningar</h1>
        <p className="text-sm text-gray-500 mt-0.5">{session?.user?.email}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-xl space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-indigo-500" />
              <h2 className="font-semibold text-gray-900">Byt lösenord</h2>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nuvarande lösenord</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nytt lösenord</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <p className="text-xs text-gray-400 mt-1">Minst 8 tecken</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bekräfta nytt lösenord</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              {result && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {result.ok && <CheckCircle className="w-4 h-4" />}
                  {result.message}
                </div>
              )}
              <button type="submit" disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Byt lösenord
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
