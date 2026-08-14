'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Lock, Loader2, CheckCircle, Users, Plus, Trash2, Eye, EyeOff } from 'lucide-react';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

type Section = 'password' | 'users';

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'admin';
  const [activeSection, setActiveSection] = useState<Section>('password');

  // Lösenord
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showNewUser, setShowNewUser] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwResult, setPwResult] = useState<{ok: boolean; message: string} | null>(null);

  // Användare
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    if (activeSection === 'users' && isAdmin) loadUsers();
  }, [activeSection]);

  async function loadUsers() {
    setUsersLoading(true);
    const res = await fetch('/api/users');
    if (res.ok) setUsers(await res.json());
    setUsersLoading(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setPwResult({ ok: false, message: 'De nya lösenorden matchar inte' }); return; }
    setPwLoading(true); setPwResult(null);
    try {
      const res = await fetch('/api/user/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await res.json();
      if (res.ok) { setPwResult({ ok: true, message: 'Lösenordet har uppdaterats!' }); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }
      else setPwResult({ ok: false, message: data.error });
    } catch { setPwResult({ ok: false, message: 'Något gick fel' }); }
    setPwLoading(false);
  }

  async function addUser() {
    if (!newName || !newEmail || !newPassword2) { setAddError('Fyll i alla fält'); return; }
    setAddLoading(true); setAddError('');
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, email: newEmail, password: newPassword2, role: newRole }) });
      const data = await res.json();
      if (res.ok) { setShowAddUser(false); setNewName(''); setNewEmail(''); setNewPassword2(''); setNewRole('editor'); loadUsers(); }
      else setAddError(data.error);
    } catch { setAddError('Något gick fel'); }
    setAddLoading(false);
  }

  async function updateRole(id: number, role: string) {
    await fetch(`/api/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
    loadUsers();
  }

  async function deleteUser(id: number) {
    if (!confirm('Ta bort användaren?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    loadUsers();
  }

  function sectionBtn(key: Section, label: string, Icon: any) {
    return (
      <button onClick={() => setActiveSection(key)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeSection === key ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}>
        <Icon className="w-4 h-4" />{label}
      </button>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-semibold text-gray-900">Inställningar</h1>
        <p className="text-sm text-gray-500 mt-0.5">{session?.user?.email}</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidonav */}
        <div className="w-48 border-r border-gray-200 bg-white p-3 space-y-1 flex-shrink-0">
          {sectionBtn('password', 'Lösenord', Lock)}
          {isAdmin && sectionBtn('users', 'Användare', Users)}
        </div>

        {/* Innehåll */}
        <div className="flex-1 overflow-y-auto p-8">

          {/* Lösenord */}
          {activeSection === 'password' && (
            <div className="max-w-xl">
              <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-indigo-500" />
                  <h2 className="font-semibold text-gray-900">Byt lösenord</h2>
                </div>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nuvarande lösenord</label>
                    <div className="relative">
                      <input type={showCurrent ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10" />
                      <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nytt lösenord</label>
                    <div className="relative">
                      <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10" />
                      <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Minst 8 tecken</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bekräfta nytt lösenord</label>
                    <div className="relative">
                      <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10" />
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {pwResult && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${pwResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {pwResult.ok && <CheckCircle className="w-4 h-4" />}
                      {pwResult.message}
                    </div>
                  )}
                  <button type="submit" disabled={pwLoading}
                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                    {pwLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Byt lösenord
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Användare */}
          {activeSection === 'users' && isAdmin && (
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">Användare</h2>
                <button onClick={() => setShowAddUser(!showAddUser)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                  <Plus className="w-3.5 h-3.5" /> Ny användare
                </button>
              </div>

              {showAddUser && (
                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                  <h3 className="text-sm font-medium text-gray-900">Ny användare</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Namn *</label>
                      <input value={newName} onChange={e => setNewName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">E-post *</label>
                      <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Lösenord *</label>
                      <div className="relative">
                        <input type={showNewUser ? 'text' : 'password'} value={newPassword2} onChange={e => setNewPassword2(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10" />
                        <button type="button" onClick={() => setShowNewUser(!showNewUser)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                          {showNewUser ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Roll</label>
                      <select value={newRole} onChange={e => setNewRole(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </div>
                  </div>
                  {addError && <p className="text-sm text-red-600">{addError}</p>}
                  <div className="flex gap-2">
                    <button onClick={addUser} disabled={addLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                      {addLoading && <Loader2 className="w-4 h-4 animate-spin" />} Lägg till
                    </button>
                    <button onClick={() => setShowAddUser(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                      Avbryt
                    </button>
                  </div>
                </div>
              )}

              {usersLoading ? (
                <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Laddar...</div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Namn</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">E-post</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Roll</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {users.map(u => (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                          <td className="px-4 py-3 text-gray-600">{u.email}</td>
                          <td className="px-4 py-3">
                            <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                              <option value="admin">Admin</option>
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => deleteUser(u.id)} className="text-red-400 hover:text-red-600 p-1">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
