import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Shield, Lock, Eye, EyeOff, KeyRound } from 'lucide-react';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Two-factor step, entered only when the account has TOTP enabled.
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const { login, verifyTotp, isAdmin, isLoading } = useAdminAuth();
  const navigate = useNavigate();

  // Navigating during render (instead of in an effect) can leave React mid-
  // commit and blank the page — always redirect from an effect.
  useEffect(() => {
    if (!isLoading && isAdmin) {
      navigate('/admin');
    }
  }, [isLoading, isAdmin, navigate]);

  if (!isLoading && isAdmin) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.ok) {
      navigate('/admin');
    } else if (result.requiresTotp) {
      setPendingToken(result.pendingToken);
    } else {
      setError('Неверный email или пароль');
    }
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingToken) return;
    setError('');
    setLoading(true);
    const ok = await verifyTotp(pendingToken, code);
    setLoading(false);
    if (ok) {
      navigate('/admin');
    } else {
      setError('Неверный код. Проверьте приложение-аутентификатор.');
      setCode('');
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
              {pendingToken ? <KeyRound className="w-8 h-8 text-amber-400" /> : <Shield className="w-8 h-8 text-amber-400" />}
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              {pendingToken ? 'Код подтверждения' : 'Админ-панель'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {pendingToken ? 'Введите код из приложения-аутентификатора' : 'Royal Home TJ'}
            </p>
          </div>

          {pendingToken ? (
            <form onSubmit={handleVerifyTotp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">6-значный код</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-center text-2xl tracking-[0.4em] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all"
                />
              </div>

              {error && (
                <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-medium">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#1a4d3a' }}
              >
                {loading ? 'Проверка...' : 'Подтвердить'}
              </button>
              <button
                type="button"
                onClick={() => { setPendingToken(null); setCode(''); setError(''); }}
                className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Назад
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@royalhome.tj"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Пароль
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                    className="w-full pl-10 pr-10 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password || !email}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#1a4d3a' }}
              >
                {loading ? 'Проверка...' : 'Войти'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <a href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              На главную
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
