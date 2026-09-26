if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => console.log('[PWA] SW registered:', reg.scope))
      .catch(err => console.error('[PWA] SW registration failed:', err));
  });
}

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const card = document.getElementById('install-card');
  if (card) card.style.display = 'block';
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] Installed');
  const card = document.getElementById('install-card');
  if (card) card.style.display = 'none';
  deferredPrompt = null;
});

window.triggerInstall = async () => {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
};