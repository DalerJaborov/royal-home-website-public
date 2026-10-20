/* Added only by the production build; stable public worker URLs need revisions. */
(() => {
  if (!('serviceWorker' in navigator)) return;
  const revision = document.currentScript?.dataset.workerVersion || 'royalhome-v4-i18n';
  const register = () => {
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(revision)}`, { updateViaCache: 'none' }).catch(() => {});
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
})();
