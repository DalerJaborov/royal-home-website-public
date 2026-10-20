import { useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { formatPrice } from '../data/listings';
import { useListingsData } from '@/hooks/useListingsData';
import { useCms, HERO_BG_PHOTOS, type HeroVariant, type HeroSettings } from '../contexts/CmsContext';

const VARIANTS = [
  { key: 'photo-cards', label: 'Фото + витрина объектов', dotColor: '#F6C453' },
  { key: 'photo-clean', label: 'Чистое фото', dotColor: '#8fa89b' },
  { key: 'flat-brand', label: 'Флэт (бренд-цвет)', dotColor: '#0f3527' },
] as const;

export default function AdminHeroSettingsPage() {
  const { cms, updateHero } = useCms();
  // Раньше каждый клик/движение слайдера мгновенно писало на сервер (и на
  // живой сайт всех посетителей), а кнопка «Применить» вообще ничего не
  // сохраняла — только показывала тост. Теперь как везде в админке: правки
  // копятся локально, «Сохранить» отправляет их одним разом.
  const [settings, setSettings] = useState<HeroSettings>(cms.hero);
  const [saved, setSaved] = useState(false);
  const { listings: LISTINGS } = useListingsData();

  const handleSave = () => {
    updateHero(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleVariantChange = (variant: HeroVariant) => {
    setSettings(p => ({ ...p, variant }));
  };

  const handleBgPhotoSelect = (id: number) => {
    if (settings.variant === 'flat-brand') return;
    setSettings(p => ({ ...p, bgPhoto: id }));
  };

  const handleOverlayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setSettings(p => ({ ...p, overlayStrength: val / 100 }));
  };

  const handleCardsToggle = () => {
    setSettings(p => ({ ...p, cardsOn: !p.cardsOn }));
  };

  const toggleListing = (id: number) => {
    setSettings(p => {
      const exists = p.selected.includes(id);
      const nextSelected = exists
        ? (p.selected.length > 1 ? p.selected.filter(sid => sid !== id) : p.selected)
        : [...p.selected, id];
      return { ...p, selected: nextSelected };
    });
  };

  const isPhotoBlocked = settings.variant === 'flat-brand';
  const supportsCards = settings.variant !== 'photo-clean';

  return (
    <AdminLayout>
      <style>{`
        .admin-panel{ max-width:920px; margin:0 auto; background:#ffffff; border-radius:22px; box-shadow:0 20px 50px rgba(16,25,20,0.08); overflow:hidden; font-family:'Inter', sans-serif; color:#101914; }
        .admin-header{ padding:24px 28px; border-bottom:1px solid #eceeec; background:#0f3527; color:#fff; display:flex; align-items:center; justify-content:space-between; }
        .admin-title{ font-size:15px; font-weight:700; font-family:'Unbounded', sans-serif; }
        .admin-note{ font-size:12.5px; color:#a9c4b6; margin-top:3px; }
        .admin-body{ padding:28px; display:grid; gap:28px; }
        .admin-section-label{ font-size:12.5px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#5a6b62; margin-bottom:12px; }
        .variant-pills{ display:flex; gap:10px; flex-wrap:wrap; }
        .variant-pill{ border:1.5px solid #dde3df; background:#fff; border-radius:13px; padding:12px 16px; cursor:pointer; font-size:13.5px; font-weight:600; color:#38473e; transition:.15s; display:flex; align-items:center; gap:9px; }
        .variant-pill:hover{ border-color:#b7c9be; }
        .variant-pill.active{ border-color:#0f3527; background:#0f3527; color:#fff; }
        .variant-pill .dot{ width:9px; height:9px; border-radius:50%; flex-shrink:0; }
        .bg-photo-grid{ display:flex; gap:10px; flex-wrap:wrap; }
        .bg-photo-opt{ width:100px; height:66px; border-radius:11px; overflow:hidden; cursor:pointer; border:2px solid transparent; position:relative; flex-shrink:0; transition:.15s; }
        .bg-photo-opt img{ width:100%; height:100%; object-fit:cover; display:block; }
        .bg-photo-opt:hover{ border-color:#b7c9be; }
        .bg-photo-opt.active{ border-color:#0f3527; }
        .bg-photo-opt.active::after{ content:"✓"; position:absolute; top:5px; right:5px; width:18px; height:18px; background:#0f3527; color:#fff; border-radius:50%; font-size:11px; display:flex; align-items:center; justify-content:center; font-weight:700; }
        .bg-photo-opt.disabled{ opacity:.4; cursor:not-allowed; pointer-events:none; }
        .toggle-row{ display:flex; align-items:center; justify-content:space-between; padding:14px 16px; background:#f6f8f6; border-radius:13px; }
        .toggle-row-label{ font-size:13.5px; font-weight:600; }
        .toggle-row-sub{ font-size:12px; color:#7c8b82; margin-top:2px; }
        .range-row{ display:flex; align-items:center; gap:14px; }
        .range-row input[type="range"]{ flex:1; -webkit-appearance:none; appearance:none; height:5px; border-radius:999px; background:#dde3df; outline:none; cursor:pointer; }
        .range-row input[type="range"]::-webkit-slider-thumb{ -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:#0f3527; cursor:pointer; border:3px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.3); }
        .range-row input[type="range"]::-moz-range-thumb{ width:18px; height:18px; border-radius:50%; background:#0f3527; cursor:pointer; border:3px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.3); }
        .range-value{ font-size:12.5px; font-weight:700; color:#38473e; width:38px; text-align:right; flex-shrink:0; }
        .switch{ position:relative; width:44px; height:26px; flex-shrink:0; display:inline-block; }
        .switch input{ opacity:0; width:0; height:0; }
        .slider{ position:absolute; inset:0; background:#cfd8d3; border-radius:999px; cursor:pointer; transition:.2s; }
        .slider::before{ content:""; position:absolute; width:20px; height:20px; left:3px; top:3px; background:#fff; border-radius:50%; transition:.2s; }
        .switch input:checked + .slider{ background:#0f3527; }
        .switch input:checked + .slider::before{ transform:translateX(18px); }
        .switch input:disabled + .slider{ opacity:.45; cursor:not-allowed; }
        .prop-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(190px,1fr)); gap:12px; }
        .prop-card{ border:1.5px solid #dde3df; border-radius:14px; padding:10px; cursor:pointer; display:flex; gap:10px; align-items:center; transition:.15s; position:relative; }
        .prop-card:hover{ border-color:#b7c9be; }
        .prop-card.selected{ border-color:#0f3527; background:#f2f6f3; }
        .prop-card.disabled{ opacity:.4; cursor:not-allowed; pointer-events:none; }
        .prop-card img{ width:52px; height:52px; border-radius:9px; object-fit:cover; flex-shrink:0; }
        .prop-card-title{ font-size:12.5px; font-weight:600; line-height:1.25; }
        .prop-card-price{ font-size:12px; color:#5a6b62; margin-top:2px; }
        .prop-check{ position:absolute; top:8px; right:8px; width:18px; height:18px; border-radius:6px; border:1.5px solid #c6cfc9; background:#fff; display:flex; align-items:center; justify-content:center; }
        .prop-card.selected .prop-check{ background:#0f3527; border-color:#0f3527; }
        .apply-row{ display:flex; align-items:center; gap:14px; }
        .apply-btn{ background:#F6C453; color:#101914; border:none; border-radius:12px; padding:13px 26px; font-weight:700; font-size:14px; cursor:pointer; transition:.2s; font-family:'Inter', sans-serif; }
        .apply-btn:hover{ background:#FFD86A; }
        .toast{ font-size:13px; color:#3d7a55; font-weight:600; opacity:0; transition:.3s; }
        .toast.show{ opacity:1; }
        @media (max-width:640px){
          .admin-body{ padding:20px; }
          .admin-header{ padding:18px 20px; }
        }
      `}</style>

      <div className="admin-panel">
        <div className="admin-header">
          <div>
            <div className="admin-title">Настройки Hero</div>
            <div className="admin-note">Изменения попадут на сайт только после «Сохранить»</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="#fff" strokeWidth="1.6"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#fff" strokeWidth="1.4"/>
          </svg>
        </div>

        <div className="admin-body">
          {/* Variant pills */}
          <div>
            <div className="admin-section-label">Вариант hero</div>
            <div className="variant-pills">
              {VARIANTS.map(v => {
                const isActive = settings.variant === v.key;
                return (
                  <button
                    key={v.key}
                    className={`variant-pill ${isActive ? 'active' : ''}`}
                    onClick={() => handleVariantChange(v.key as HeroVariant)}
                  >
                    <span className="dot" style={{ background: isActive ? '#F6C453' : v.dotColor }} />
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Background photo grid */}
          <div>
            <div className="admin-section-label">Фоновое фото hero</div>
            <div className="bg-photo-grid">
              {HERO_BG_PHOTOS.map(photo => {
                const active = settings.bgPhoto === photo.id;
                return (
                  <div
                    key={photo.id}
                    className={`bg-photo-opt ${active ? 'active' : ''} ${isPhotoBlocked ? 'disabled' : ''}`}
                    title={photo.label}
                    onClick={() => handleBgPhotoSelect(photo.id)}
                  >
                    <img src={photo.src} alt={photo.label} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Overlay slider */}
          <div>
            <div className="admin-section-label">Затемнение фона</div>
            <div className="range-row">
              <input
                type="range"
                min={40}
                max={115}
                value={Math.round(settings.overlayStrength * 100)}
                onChange={handleOverlayChange}
              />
              <span className="range-value">{Math.round(settings.overlayStrength * 100)}%</span>
            </div>
          </div>

          {/* Cards toggle */}
          <div className="toggle-row">
            <div>
              <div className="toggle-row-label">Плавающие карточки объектов</div>
              <div className="toggle-row-sub">Показывать реальные объекты поверх hero</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.cardsOn}
                disabled={!supportsCards}
                onChange={handleCardsToggle}
              />
              <span className="slider" />
            </label>
          </div>

          {/* Property grid */}
          <div>
            <div className="admin-section-label">Какие объекты показывать (крутятся по очереди на мобильном, не повторяясь)</div>
            <div className="prop-grid">
              {LISTINGS.map(item => {
                const selected = settings.selected.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`prop-card ${selected ? 'selected' : ''} ${!supportsCards ? 'disabled' : ''}`}
                    onClick={() => supportsCards && toggleListing(item.id)}
                  >
                    <div className="prop-check">
                      {selected && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                          <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <img src={item.photos?.[0] || `/images/apartments/apt${item.id}.jpg`} alt="" />
                    <div>
                      <div className="prop-card-title">{item.title}</div>
                      <div className="prop-card-price">{formatPrice(item.price)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save button */}
          <div className="apply-row">
            <button className="apply-btn" onClick={handleSave}>Сохранить</button>
            <span className={`toast ${saved ? 'show' : ''}`}>Настройки сохранены</span>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
