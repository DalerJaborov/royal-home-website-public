import { useState } from 'react';
import { trpc } from '@/providers/trpc';
import { ShieldCheck, ShieldOff, KeyRound, Loader2 } from 'lucide-react';

const inputClass = 'w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all';

export default function TwoFactorSettings() {
  const utils = trpc.useUtils();
  const statusQuery = trpc.auth.totpStatus.useQuery();
  const setupMutation = trpc.auth.totpSetup.useMutation();
  const confirmMutation = trpc.auth.totpConfirm.useMutation();
  const disableMutation = trpc.auth.totpDisable.useMutation();

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [setupPassword, setSetupPassword] = useState('');

  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [disableError, setDisableError] = useState('');

  const startSetup = async () => {
    setConfirmError('');
    try {
      const res = await setupMutation.mutateAsync({ password: setupPassword });
      setSetupPassword('');
      setQrCode(res.qrCodeDataUrl);
      setSecret(res.secret);
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : 'Не удалось начать настройку 2FA');
    }
  };

  const cancelSetup = () => {
    setQrCode(null);
    setSecret(null);
    setCode('');
    setConfirmError('');
  };

  const confirmSetup = async () => {
    setConfirmError('');
    try {
      await confirmMutation.mutateAsync({ code });
      setQrCode(null);
      setSecret(null);
      setCode('');
      await utils.auth.totpStatus.invalidate();
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : 'Неверный код');
    }
  };

  const disable = async () => {
    setDisableError('');
    try {
      await disableMutation.mutateAsync({ password: disablePassword, code: disableCode });
      setShowDisable(false);
      setDisablePassword('');
      setDisableCode('');
      await utils.auth.totpStatus.invalidate();
    } catch (e) {
      setDisableError(e instanceof Error ? e.message : 'Неверный пароль');
    }
  };

  const enabled = statusQuery.data?.enabled;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5" /> Двухфакторная аутентификация
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Google Authenticator, Authy или любое TOTP-приложение. Дополнительный код при входе — даже если пароль узнают, зайти не смогут.
      </p>

      {statusQuery.isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      ) : qrCode ? (
        <div className="space-y-4 max-w-sm">
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col items-center gap-3">
            <img src={qrCode} alt="QR-код для приложения-аутентификатора" className="w-48 h-48" />
            {secret && (
              <p className="text-xs text-gray-400 text-center break-all">
                Не сканируется? Введите вручную: <span className="font-mono text-gray-600">{secret}</span>
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Код из приложения</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className={`${inputClass} text-center text-xl tracking-[0.3em] font-bold`}
            />
          </div>
          {confirmError && <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-medium">{confirmError}</div>}
          <div className="flex gap-3">
            <button
              onClick={confirmSetup}
              disabled={code.length !== 6 || confirmMutation.isPending}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#1a4d3a' }}
            >
              {confirmMutation.isPending ? 'Проверка...' : 'Включить'}
            </button>
            <button onClick={cancelSetup} className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50">
              Отмена
            </button>
          </div>
        </div>
      ) : enabled ? (
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold mb-4">
            <ShieldCheck className="w-4 h-4" /> Включена
          </div>
          {!showDisable ? (
            <div>
              <button
                onClick={() => setShowDisable(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 transition-colors"
              >
                <ShieldOff className="w-4 h-4" /> Отключить
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-w-sm">
              <label className="block text-sm font-medium text-gray-700" htmlFor="disable-2fa-password">Текущий пароль</label>
              <input
                id="disable-2fa-password"
                autoComplete="current-password"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Пароль от аккаунта"
                className={inputClass}
              />
              <label className="block text-sm font-medium text-gray-700" htmlFor="disable-2fa-code">Код из приложения</label>
              <input id="disable-2fa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))} className={inputClass} />
              {disableError && <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-medium">{disableError}</div>}
              <div className="flex gap-3">
                <button onClick={disable} disabled={!disablePassword || disableCode.length !== 6 || disableMutation.isPending} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50">
                  {disableMutation.isPending ? 'Отключение...' : 'Да, отключить'}
                </button>
                <button onClick={() => { setShowDisable(false); setDisableError(''); setDisablePassword(''); setDisableCode(''); }} className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50">
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700" htmlFor="setup-2fa-password">Для настройки подтвердите текущий пароль</label>
          <input id="setup-2fa-password" type="password" autoComplete="current-password" value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} className={`${inputClass} max-w-sm`} />
          {confirmError && <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-medium">{confirmError}</div>}
          <button
            onClick={startSetup}
            disabled={!setupPassword || setupMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#1a4d3a' }}
          >
            <KeyRound className="w-4 h-4" /> {setupMutation.isPending ? 'Генерация...' : 'Настроить 2FA'}
          </button>
        </div>
      )}
    </div>
  );
}
