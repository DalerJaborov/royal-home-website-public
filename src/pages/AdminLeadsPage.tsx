import { trpc } from '@/providers/trpc';
import AdminLayout from '@/components/AdminLayout';
import { Phone, MessageSquare, Check } from 'lucide-react';

const STATUSES = [
  { value: 'new', label: 'Новая', activeClass: 'bg-blue-600 text-white' },
  { value: 'contacted', label: 'В работе', activeClass: 'bg-amber-500 text-white' },
  { value: 'closed', label: 'Закрыта', activeClass: 'bg-emerald-700 text-white' },
] as const;

export default function AdminLeadsPage() {
  const utils = trpc.useUtils();
  const { data: leads, isLoading, isError } = trpc.lead.list.useQuery(undefined, { refetchInterval: 30_000 });
  const retryDelivery = trpc.lead.retryDelivery.useMutation({ onSuccess: () => utils.lead.list.invalidate() });
  const deliveryHealth = trpc.lead.deliveryHealth.useQuery(undefined, { refetchInterval: 30_000 });
  const updateStatus = trpc.lead.updateStatus.useMutation({
    onSuccess: () => utils.lead.list.invalidate(),
  });

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Заявки</h1>
          <p className="text-sm text-gray-500 mt-1">
            {leads?.length ?? 0} последних обращений с сайта. Доставка в CRM выполняется очередью с повторами.
          </p>
          {deliveryHealth.isError && <p role="alert" className="text-sm text-red-700 mt-2">Статус очереди недоступен. Проверьте журнал приложения.</p>}
          {deliveryHealth.data?.filter(row => row.state !== 'delivered' && row.count > 0).map(row => <p key={row.state} role="status" className="text-sm text-amber-800 mt-2">
            Вся очередь: {row.state === 'blocked' ? 'остановлено' : 'ожидает доставки'} — {row.count}.
            {row.oldest && ` Самая ранняя заявка: ${new Date(row.oldest).toLocaleString('ru-RU')}.`}
          </p>)}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {isError ? <p role="alert" className="p-4 text-red-700">Не удалось загрузить заявки и статусы доставки. Обновите страницу.</p> : isLoading ? (
            <div className="p-12 text-center text-gray-400">Загрузка...</div>
          ) : !leads?.length ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-gray-500">Пока нет заявок</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {leads.map((lead) => (
                <div key={lead.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{lead.name || 'Без имени'}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{lead.source}</span>
                    </div>
                    <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-sm text-emerald-700 font-medium mt-1 hover:underline">
                      <Phone className="w-3.5 h-3.5" /> {lead.phone}
                    </a>
                    {lead.message && (
                      <p className="text-sm text-gray-500 mt-2 whitespace-pre-line">{lead.message}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(lead.createdAt).toLocaleString('ru-RU')}
                    </p>
                    <p className="text-xs text-gray-600 mt-2" role="status">
                      CRM: {lead.crmClientId ? 'Доставлено' : lead.delivery?.state === 'blocked' ? 'Доставка остановлена — проверьте настройку CRM' : lead.delivery ? 'В очереди доставки' : 'Старая заявка — требуется ручная проверка доставки'}
                      {lead.delivery && ` · попыток: ${lead.delivery.attempts}`}
                      {lead.delivery?.lastError && ` · ${lead.delivery.lastError}`}
                      {lead.delivery?.state === 'pending' && ` · следующая попытка: ${new Date(lead.delivery.nextAttemptAt).toLocaleString('ru-RU')}`}
                    </p>
                    {lead.delivery?.state === 'blocked' && <button type="button" disabled={retryDelivery.isPending}
                      onClick={() => retryDelivery.mutate({ id: lead.id })} className="text-xs underline text-emerald-700 mt-1">Повторить доставку после исправления</button>}
                    {retryDelivery.isError && retryDelivery.variables?.id === lead.id && <p role="alert" className="text-xs text-red-700">Повтор не запланирован. Обновите страницу и попробуйте снова.</p>}
                    <div className="flex items-center gap-1.5 mt-3">
                      {STATUSES.map((s) => {
                        const isActive = lead.status === s.value;
                        return (
                          <button
                            key={s.value}
                            type="button"
                            disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ id: lead.id, status: s.value })}
                            className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full transition-all disabled:opacity-50 ${
                              isActive ? s.activeClass : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {isActive && <Check className="w-3 h-3" />}
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
