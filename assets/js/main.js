/* Portfolio — interactions partagées
   - barre de progression du scroll
   - révélation au scroll (IntersectionObserver)
   - parallaxe légère des titres [data-parallax]
*/
(function () {
  'use strict';

  var html = document.documentElement;

  function motionAllowed() {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !reduce || html.classList.contains('force-motion');
  }

  /* --- révélation au scroll --- */
  var els = [].slice.call(document.querySelectorAll('[data-reveal]'));
  if ('IntersectionObserver' in window && els.length) {
    var io = new IntersectionObserver(function (entries) {
      var batch = entries.filter(function (e) { return e.isIntersecting; });
      batch.sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      batch.forEach(function (e, i) {
        e.target.style.animationDelay = (i * 70) + 'ms';
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });

    // Filet de sécurité : révéler immédiatement ce qui est déjà au-dessus de la ligne de flottaison.
    var revealInView = function () {
      var vh = window.innerHeight || document.documentElement.clientHeight;
      els.forEach(function (el) {
        if (el.classList.contains('in')) return;
        var r = el.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > 0) {
          el.style.animationDelay = '0ms';
          el.classList.add('in');
          io.unobserve(el);
        }
      });
    };
    revealInView();
    window.addEventListener('load', revealInView);
  } else {
    els.forEach(function (el) { el.classList.add('in'); });
  }

  /* --- progression + parallaxe --- */
  var bar = document.getElementById('progress');
  var parallaxEls = [].slice.call(document.querySelectorAll('[data-parallax]'));

  function onScroll() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    var y = window.pageYOffset || h.scrollTop;
    if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? (y / max) : 0).toFixed(4) + ')';
    if (motionAllowed()) {
      parallaxEls.forEach(function (el) {
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.08;
        var fade = parseFloat(el.getAttribute('data-parallax-fade')) || 520;
        el.style.transform = 'translateY(' + (y * speed).toFixed(1) + 'px)';
        el.style.opacity = Math.max(0, 1 - y / fade).toFixed(3);
      });
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
