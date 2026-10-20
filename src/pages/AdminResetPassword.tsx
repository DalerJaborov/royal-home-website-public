import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, Lock } from 'lucide-react';
import { trpc } from '@/providers/trpc';

// С3/security-audit-11-09.md: вторая половина аварийного сброса пароля.
// Ссылку с токеном директор получает из CRM (см. api/crm-sync-router.ts
// /admin-reset), пароль открытым текстом теперь нигде не появляется —
// новый пароль директор вводит здесь сам, токен одноразовый и живёт 15 минут.
export default function AdminResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const consumeMutation = trpc.auth.consumePasswordReset.useMutation();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Пароль должен быть не короче 8 символов');
      return;
    }
    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
    try {
      await consumeMutation.mutateAsync({ token, newPassword: password });
      setDone(true);
      setTimeout(() => navigate('/admin/login'), 2000);
    } catch {
      setError('Ссылка недействительна или истекла. Запросите новую через CRM.');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0a1f16 0%, #1a4d3a 50%, #0f2e22 100%)' }}
    >
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: '#1a4d3a' }}
            >
              <KeyRound className="w-8 h-8 text-amber-400" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Новый пароль</h1>
            <p className="text-sm text-gray-500 mt-1">Ссылка одноразовая, действует 15 минут</p>
          </div>

          {!token ? (
            <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-medium">
              В ссылке нет токена. Запросите новую ссылку через CRM.
            </div>
          ) : done ? (
            <div className="px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-medium">
              Пароль изменён. Все прежние сессии разлогинены. Перенаправляем на вход…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Новый пароль</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Минимум 8 символов"
                    autoFocus
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Повторите пароль</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-medium">{error}</div>
              )}

              <button
                type="submit"
                disabled={consumeMutation.isPending || !password || !confirm}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#1a4d3a' }}
              >
                {consumeMutation.isPending ? 'Сохранение...' : 'Сохранить пароль'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <a href="/admin/login" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              К входу
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
