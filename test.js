console.log('✅ player boot', location.pathname);
(() => {
  const BOOT = () => {
    console.log('✅ player boot', location.pathname);

    // tu potem wejdzie: wykrywanie kafelków/listy + MP3 per produkt + sticky
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', BOOT);
  } else {
    BOOT();
  }
})();
