// Applies the stored theme before first paint. Kept as an external file so the
// Content-Security-Policy can forbid inline scripts. Mirrors src/lib/theme.ts.
(function () {
  try {
    var stored = localStorage.getItem('rotawise-theme') || localStorage.getItem('theme');
    var theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {
    // storage blocked: the CSS default (light) applies until React mounts
  }
  try {
    var lang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('rotawise-language');
    if (lang !== 'en' && lang !== 'es') lang = /^es\b/i.test(navigator.language || '') ? 'es' : 'en';
    document.documentElement.lang = lang;
  } catch (e) {
    // keep the default lang attribute
  }
})();
