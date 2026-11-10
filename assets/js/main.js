// Console Easter egg
(function () {
  var isEn = document.documentElement.lang === 'en' || window.location.pathname.indexOf('/en/') !== -1;
  var msg = isEn
    ? "Looking under the hood? Always great to meet a fellow engineer!\nLet's talk tech, architecture or immersive projects:\n✉ pdesbrosses@outlook.fr · 🐙 github.com/paul-des-brosses\n"
    : "Curieux d'inspecter sous le capot ? Ravi de voir un pair !\nDiscutons tech, architecture ou projets immersifs :\n✉ pdesbrosses@outlook.fr · 🐙 github.com/paul-des-brosses\n";

  console.log(
    '%c  PAUL DES BROSSES  %c  Creative Technology Engineer\n' +
    '%c  Hardware · Signal Processing · 3D Realtime\n\n' +
    '%c' + msg,
    'background: #2A3235; color: #F4F1EA; font-weight: bold; padding: 4px 8px; border-radius: 4px; font-size: 13px; font-family: monospace;',
    'color: #58879B; font-weight: bold; font-size: 12px; font-family: monospace;',
    'color: #778A71; font-size: 11px; font-family: monospace; font-style: italic;',
    'color: #2A3235; font-size: 11px; font-family: monospace; line-height: 1.5;'
  );
})();

// Nettoyage de l'URL si accès direct avec extension .html
(function () {
  if (window.location.pathname.endsWith('/index.html')) {
    window.history.replaceState(null, '', window.location.pathname.slice(0, -10) + window.location.search + window.location.hash);
  } else if (window.location.pathname.endsWith('.html')) {
    window.history.replaceState(null, '', window.location.pathname.slice(0, -5) + window.location.search + window.location.hash);
  }
})();

// Progress bar on scroll
const progressEl = document.getElementById('progress');
if (progressEl) {
  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progressEl.style.width = pct + '%';
  }, { passive: true });
}

// Reveal on scroll
const revealEls = document.querySelectorAll('[data-reveal]');
if (revealEls.length) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Sans IntersectionObserver, ou si l'utilisateur demande moins d'animations,
  // tout est affiché d'emblée : le contenu ne doit jamais rester invisible.
  if (reduced || !('IntersectionObserver' in window)) {
    revealEls.forEach(el => el.classList.add('visible'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(el => io.observe(el));

    // Filet de sécurité : un élément jamais observé (hors flux, viewport
    // inhabituel) finit tout de même par apparaître.
    window.setTimeout(() => {
      revealEls.forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add('visible');
        }
      });
    }, 1500);
  }
}
