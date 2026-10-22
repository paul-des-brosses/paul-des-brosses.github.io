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
