/*!
 * FluidMerge — animation de matière (attraction → collision → submersion)
 * Aucune dépendance. ~1 fichier. Compatible multi-instances.
 *
 * USAGE RAPIDE (HTML seul) :
 *   <section data-fluid-merge data-palette="argile">
 *     <img data-fluid-anchor ...>   <!-- 1re ancre (haut)  -->
 *     <img data-fluid-anchor ...>   <!-- 2e ancre (bas)    -->
 *     <div data-fluid-target>…</div> <!-- optionnel : où la matière se disperse -->
 *     <div data-fluid-target>…</div>
 *   </section>
 *   <script src="fluid-merge.js"></script>
 *
 * USAGE JS :
 *   const fm = FluidMerge.init('#hero', {
 *     anchors: ['#img1', '#img2'],
 *     targets: ['#text1', '#text2'],
 *     palette: 'sable-foret',
 *     duration: 16
 *   });
 *   fm.pause(); fm.play(); fm.restart(); fm.setProgress(0.5); fm.destroy();
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FluidMerge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ==========================================================================
  // PALETTES — ajoutez les vôtres ici ou passez `colors` en option
  // ==========================================================================
  var PALETTES = {
    'argile':       { top: '#C86D51', mid: '#5E4B56', bottom: '#3B7A75', background: '#111312' },
    'sable-foret':  { top: '#CDB891', mid: '#7C8667', bottom: '#2E4B3F', background: '#111312' },
    'ocre-ardoise': { top: '#C99A45', mid: '#7A7468', bottom: '#4A5A6A', background: '#111312' }
  };

  // ==========================================================================
  // OPTIONS PAR DÉFAUT
  // ==========================================================================
  var DEFAULTS = {
    // Éléments DOM (sélecteur, élément, ou tableau des deux). Si absent :
    // on cherche [data-fluid-anchor] / [data-fluid-target] dans le conteneur.
    anchors: null,           // 2 éléments : les masses restent ancrées dessus
    targets: null,           // 2 éléments (optionnel) : cibles de la dispersion

    // Couleurs
    palette: 'argile',       // 'argile' | 'sable-foret' | 'ocre-ardoise'
    colors: null,            // { top, mid, bottom, background } — remplace la palette
    transparent: false,      // true = fond transparent (le fond de votre site reste visible)

    // Déroulement
    mode: 'time',            // 'time' (automatique) | 'scroll' (lié au défilement) | 'manual' (setProgress)
    duration: 20,            // durée en secondes (mode 'time')
    loop: true,              // recommencer à la fin
    pauseAtEnd: 4,           // pause à la fin avant de relancer (secondes)
    autoplay: true,          // démarrer tout de suite (mode 'time')
    scrollStart: 0.85,       // mode 'scroll' : 0% quand le haut du conteneur atteint cette hauteur d'écran (0–1)
    scrollEnd: 0.60,         // mode 'scroll' : 100% quand le bas du conteneur atteint cette hauteur d'écran

    // Matière
    viscosity: 0.048,        // 0.025 très fluide · 0.05 souple · 0.12 pâteux
    agitation: 0.016,        // ondulation des bords
    waveSpeed: 0.75,         // vitesse des ondulations internes
    haloScale: 1.32,         // taille de la masse autour des ancres (1 = taille de l'image)
    grain: 1.0,              // intensité du grain minéral (0 = aucun, 2 = marqué)

    // Technique
    maxDpr: 2,               // limite de résolution (baisser à 1 pour économiser le GPU)
    trackLayout: false,      // true si vos éléments bougent via CSS/JS sans changer de taille
    respectReducedMotion: true, // prefers-reduced-motion : image fixe, sans animation
    zIndex: -1               // le canvas passe derrière le contenu du conteneur
  };

  // ==========================================================================
  // SHADERS
  // ==========================================================================
  var VERT = [
    'attribute vec2 a_position;',
    'void main() { gl_Position = vec4(a_position, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    '',
    'uniform vec2 u_resolution;',
    'uniform float u_time;',
    'uniform float u_progress;',
    'uniform vec2 u_pos1;',
    'uniform vec2 u_pos2;',
    'uniform vec2 u_target1;',
    'uniform vec2 u_target2;',
    'uniform float u_radius;',
    'uniform float u_halo;',
    'uniform float u_viscosity;',
    'uniform float u_agitation;',
    'uniform float u_grain;',
    'uniform float u_transparent;',
    'uniform vec3 u_colorTop;',
    'uniform vec3 u_colorMid;',
    'uniform vec3 u_colorBottom;',
    'uniform vec3 u_bgColor;',
    '',
    'vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }',
    '',
    'float snoise(vec2 v) {',
    '  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);',
    '  vec2 i  = floor(v + dot(v, C.yy));',
    '  vec2 x0 = v - i + dot(i, C.xx);',
    '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
    '  vec4 x12 = x0.xyxy + C.xxzz;',
    '  x12.xy -= i1;',
    '  i = mod289(i);',
    '  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));',
    '  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);',
    '  m = m * m;',
    '  m = m * m;',
    '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
    '  vec3 h = abs(x) - 0.5;',
    '  vec3 ox = floor(x + 0.5);',
    '  vec3 a0 = x - ox;',
    '  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);',
    '  vec3 g;',
    '  g.x  = a0.x  * x0.x  + h.x  * x0.y;',
    '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
    '  return 130.0 * dot(m, g);',
    '}',
    '',
    'float fbm(vec2 p) {',
    '  return 0.65 * snoise(p) + 0.35 * snoise(p * 2.1 + vec2(4.2, -1.8));',
    '}',
    '',
    'float hash12(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    '',
    'float smin(float a, float b, float k) {',
    '  float h = clamp(0.5 + 0.5 * (b - a) / max(k, 0.0001), 0.0, 1.0);',
    '  return mix(b, a, h) - k * h * (1.0 - h);',
    '}',
    '',
    'float sdTendril(vec2 p, vec2 a, vec2 b, float rStart, float rEnd, float phase, float pinchAmt) {',
    '  vec2 ba = b - a;',
    '  float l2 = dot(ba, ba);',
    '  if (l2 < 0.00001) return length(p - a) - rStart;',
    '  float h = clamp(dot(p - a, ba) / l2, 0.0, 1.0);',
    '  vec2 dir = normalize(ba);',
    '  vec2 perp = vec2(-dir.y, dir.x);',
    '  float wave = sin(h * 3.14159) * sin(h * 5.0 + phase) * 0.018;',
    '  vec2 curvePoint = a + ba * h + perp * wave;',
    '  float pinch = 1.0 - pinchAmt * sin(h * 3.14159);',
    '  float radius = mix(rStart, rEnd, h) * pinch;',
    '  return length(p - curvePoint) - radius;',
    '}',
    '',
    'float seedDist(vec2 q, vec2 a, vec2 b, vec2 c) {',
    '  return min(length(q - a), min(length(q - b), length(q - c)));',
    '}',
    '',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_resolution.xy;',
    '  float aspect = u_resolution.x / u_resolution.y;',
    '  float px = 1.0 / u_resolution.y;',
    '',
    '  vec2 p = vec2(uv.x * aspect, uv.y);',
    '  vec2 c1 = vec2(u_pos1.x * aspect, u_pos1.y);',
    '  vec2 c2 = vec2(u_pos2.x * aspect, u_pos2.y);',
    '  vec2 center = 0.5 * (c1 + c2);',
    '  vec2 diagDir = normalize(c2 - c1 + vec2(0.0001));',
    '  vec2 diagPerp = vec2(-diagDir.y, diagDir.x);',
    '',
    '  vec2 posText1 = vec2(u_target1.x * aspect, u_target1.y);',
    '  vec2 posText2 = vec2(u_target2.x * aspect, u_target2.y);',
    '',
    '  float prog = u_progress;',
    '',
    '  // Chronologie',
    '  float attract  = smoothstep(0.06, 0.50, prog);',
    '  float pull     = attract * attract;',
    '  float collide  = smoothstep(0.46, 0.58, prog);',
    '  float disperse = smoothstep(0.54, 0.84, prog);',
    '  float expand   = smoothstep(0.66, 1.00, prog);',
    '',
    '  float pt = (prog - 0.54) / 0.04;',
    '  float pulse = exp(-pt * pt);',
    '',
    '  // Onde de choc',
    '  float rr = length(p - center);',
    '  float front = max(prog - 0.52, 0.0) * 1.5;',
    '  float shockEnv = smoothstep(0.52, 0.545, prog) * (1.0 - smoothstep(0.545, 0.74, prog));',
    '  float sdw = (rr - front) / 0.05;',
    '  float shock = exp(-sdw * sdw) * shockEnv;',
    '  vec2 radial = (p - center) / max(rr, 0.001);',
    '',
    '  vec2 warp = vec2(',
    '    fbm(p * 3.2 + vec2(u_time * 0.45, -u_time * 0.30)),',
    '    fbm(p * 3.2 + vec2(-u_time * 0.35, u_time * 0.40) + vec2(7.1, 3.4))',
    '  );',
    '  vec2 pw = p + warp * u_agitation + radial * shock * 0.018;',
    '',
    '  float haloRadius = u_radius * u_halo * (1.0 + 0.02 * sin(u_time * 0.9));',
    '  float anchorR = haloRadius * (1.0 - 0.10 * pull);',
    '  float neckR = anchorR * mix(0.88, 0.55, pull);',
    '  float tipR  = anchorR * mix(0.80, 0.42, pull);',
    '',
    '  // Masse du haut',
    '  float dTop = length(pw - c1) - anchorR;',
    '  for (int i = 0; i < 3; i++) {',
    '    float fi = float(i);',
    '    float angle = u_time * (0.45 + fi * 0.12) + fi * 2.1;',
    '    vec2 dropPos = c1 + vec2(cos(angle), sin(angle)) * (anchorR * (0.92 + 0.08 * sin(u_time * 0.9 + fi)));',
    '    dTop = smin(dTop, length(pw - dropPos) - anchorR * 0.16 * (1.0 - 0.5 * pull), u_viscosity);',
    '  }',
    '  vec2 tip1 = mix(c1, center, pull);',
    '  float stream1A = sdTendril(pw, c1, tip1, neckR, tipR, -u_time * 1.2, 0.28);',
    '  float stream1B = sdTendril(pw, c1 + diagPerp * 0.02, tip1 - diagPerp * 0.015, neckR * 0.5, tipR * 0.6, u_time * 1.4 + 1.5, 0.35);',
    '  dTop = smin(dTop, smin(stream1A, stream1B, u_viscosity), u_viscosity * 1.2);',
    '  if (pull > 0.02) {',
    '    for (int i = 0; i < 2; i++) {',
    '      float fi = float(i);',
    '      float tDrop = fract(u_time * 0.30 + fi * 0.5);',
    '      float eased = tDrop * tDrop;',
    '      vec2 dropPos = mix(c1, tip1, eased) + diagPerp * sin(tDrop * 6.28 + u_time) * 0.012 * pull;',
    '      float dropR = anchorR * 0.14 * sin(tDrop * 3.14159) * pull;',
    '      dTop = smin(dTop, length(pw - dropPos) - dropR, u_viscosity);',
    '    }',
    '  }',
    '',
    '  // Masse du bas',
    '  float dBot = length(pw - c2) - anchorR;',
    '  for (int i = 0; i < 3; i++) {',
    '    float fi = float(i);',
    '    float angle = -u_time * (0.42 + fi * 0.12) + fi * 2.1 + 1.0;',
    '    vec2 dropPos = c2 + vec2(cos(angle), sin(angle)) * (anchorR * (0.92 + 0.08 * cos(u_time * 0.85 + fi)));',
    '    dBot = smin(dBot, length(pw - dropPos) - anchorR * 0.16 * (1.0 - 0.5 * pull), u_viscosity);',
    '  }',
    '  vec2 tip2 = mix(c2, center, pull);',
    '  float stream2A = sdTendril(pw, c2, tip2, neckR, tipR, -u_time * 1.2 + 3.14, 0.28);',
    '  float stream2B = sdTendril(pw, c2 - diagPerp * 0.02, tip2 + diagPerp * 0.015, neckR * 0.5, tipR * 0.6, u_time * 1.4 + 4.5, 0.35);',
    '  dBot = smin(dBot, smin(stream2A, stream2B, u_viscosity), u_viscosity * 1.2);',
    '  if (pull > 0.02) {',
    '    for (int i = 0; i < 2; i++) {',
    '      float fi = float(i);',
    '      float tDrop = fract(u_time * 0.28 + fi * 0.5 + 0.25);',
    '      float eased = tDrop * tDrop;',
    '      vec2 dropPos = mix(c2, tip2, eased) - diagPerp * sin(tDrop * 6.28 + u_time) * 0.012 * pull;',
    '      float dropR = anchorR * 0.14 * sin(tDrop * 3.14159) * pull;',
    '      dBot = smin(dBot, length(pw - dropPos) - dropR, u_viscosity);',
    '    }',
    '  }',
    '',
    '  // Collision',
    '  float mergeK = mix(u_viscosity * 0.35, u_viscosity * 2.6, collide);',
    '  float dFluid = smin(dTop, dBot, mergeK);',
    '  float centralR = haloRadius * 0.75 * collide * (1.0 + 0.30 * pulse);',
    '  float dMid = length(pw - center) - centralR + (1.0 - collide) * 1.0;',
    '  dFluid = smin(dFluid, dMid, mergeK);',
    '',
    '  // Dispersion vers les cibles',
    '  if (disperse > 0.001) {',
    '    float ed = 1.0 - (1.0 - disperse) * (1.0 - disperse);',
    '    vec2 lp1 = mix(center, posText1, ed);',
    '    vec2 lp2 = mix(center, posText2, ed);',
    '    float lobeR = mix(0.02, 0.20, ed);',
    '    float trail1 = sdTendril(pw, center, lp1, max(centralR * 0.8, 0.02), lobeR * 0.8, u_time * 1.3, 0.45);',
    '    float trail2 = sdTendril(pw, center, lp2, max(centralR * 0.8, 0.02), lobeR * 0.8, u_time * 1.3 + 2.0, 0.45);',
    '    float dLobe1 = length(pw - lp1) - lobeR;',
    '    float dLobe2 = length(pw - lp2) - lobeR;',
    '    float dDisp = smin(smin(trail1, dLobe1, 0.05), smin(trail2, dLobe2, 0.05), 0.04);',
    '    float splash = sin(disperse * 3.14159);',
    '    for (int i = 0; i < 4; i++) {',
    '      float fi = float(i);',
    '      float along = ed * (0.35 + 0.25 * fi);',
    '      float side = sin(fi * 2.7 + u_time * 0.8) * 0.04 * ed;',
    '      float sr = 0.020 * (1.0 - fi * 0.15) * splash;',
    '      vec2 s1 = center + (posText1 - center) * along + diagPerp * side;',
    '      vec2 s2 = center + (posText2 - center) * along - diagPerp * side;',
    '      dDisp = smin(dDisp, length(pw - s1) - sr, 0.03);',
    '      dDisp = smin(dDisp, length(pw - s2) - sr, 0.03);',
    '    }',
    '    dFluid = smin(dFluid, dDisp, mergeK * 1.2);',
    '  }',
    '',
    '  // Submersion : le rayon final est calculé pour couvrir tout le conteneur, quel que soit son format',
    '  if (expand > 0.001) {',
    '    float maxD = max(max(seedDist(vec2(0.0, 0.0), center, posText1, posText2),',
    '                         seedDist(vec2(aspect, 0.0), center, posText1, posText2)),',
    '                     max(seedDist(vec2(0.0, 1.0), center, posText1, posText2),',
    '                         seedDist(vec2(aspect, 1.0), center, posText1, posText2)));',
    '    float Rf = expand * (maxD + 0.15) + 0.05 * warp.x * expand;',
    '    float dc = seedDist(pw, center, posText1, posText2);',
    '    dFluid = smin(dFluid, dc - Rf, mix(0.02, 0.16, expand));',
    '  }',
    '',
    '  // Texture de pigment mat',
    '  float edgeSoft = 3.5 * px;',
    '  float fiber = snoise(gl_FragCoord.xy * 0.22) * px * 0.9 + fbm(p * 16.0 + 5.0) * px * 1.3;',
    '  float mask = 1.0 - smoothstep(-edgeSoft, edgeSoft, dFluid + fiber);',
    '',
    '  float blobWeight = clamp(0.5 + (dBot - dTop) * 2.5, 0.0, 1.0);',
    '  float verticalGradient = clamp((uv.y - 0.06) / 0.88 + warp.y * 0.05, 0.0, 1.0);',
    '  float gradFactor = mix(blobWeight, verticalGradient, smoothstep(0.50, 0.78, prog));',
    '',
    '  vec3 fluidColor;',
    '  if (gradFactor < 0.5) fluidColor = mix(u_colorBottom, u_colorMid, smoothstep(0.0, 0.5, gradFactor));',
    '  else fluidColor = mix(u_colorMid, u_colorTop, smoothstep(0.5, 1.0, gradFactor));',
    '',
    '  float dens1 = 0.5 + 0.5 * fbm(p * 2.4 + vec2(u_time * 0.04, -u_time * 0.03) + 11.0);',
    '  float dens2 = 0.5 + 0.5 * snoise(p * 9.0 + 3.7);',
    '  float density = mix(dens1, dens2, 0.35);',
    '  fluidColor *= mix(0.82, 1.06, density);',
    '',
    '  float rim = smoothstep(-0.045, 0.0, dFluid);',
    '  fluidColor = mix(fluidColor, fluidColor * 0.72, rim * 0.55 * (0.5 + 0.5 * density));',
    '',
    '  float alpha = mix(0.93, 1.0, density);',
    '  float a = mask * alpha;',
    '',
    '  vec3 glowColor = mix(u_colorBottom, u_colorTop, uv.y);',
    '  float bleed = exp(-max(dFluid, 0.0) * 42.0) * 0.10 * (0.6 + 0.4 * density);',
    '',
    '  float grain = ((hash12(floor(gl_FragCoord.xy)) - 0.5) * 0.030 + snoise(gl_FragCoord.xy * 0.45) * 0.008) * u_grain;',
    '',
    '  if (u_transparent > 0.5) {',
    '    // Sortie à alpha prémultiplié : le fond du site reste visible hors de la matière',
    '    float bleedA = clamp(bleed * 1.6, 0.0, 1.0);',
    '    float outA = a + (1.0 - a) * bleedA;',
    '    vec3 rgb = fluidColor * a + glowColor * bleedA * (1.0 - a) + vec3(grain) * a;',
    '    gl_FragColor = vec4(rgb, outA);',
    '  } else {',
    '    vec3 base = u_bgColor + glowColor * bleed;',
    '    vec3 col = mix(base, fluidColor, a);',
    '    col += grain * (0.35 + 0.65 * mask);',
    '    gl_FragColor = vec4(col, 1.0);',
    '  }',
    '}'
  ].join('\n');

  // ==========================================================================
  // UTILITAIRES
  // ==========================================================================
  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function resolveEl(ref, scope) {
    if (!ref) return null;
    if (typeof ref === 'string') {
      return (scope && scope.querySelector(ref)) || document.querySelector(ref);
    }
    return ref.nodeType === 1 ? ref : null;
  }

  function parseBool(v, fallback) {
    if (v == null) return fallback;
    return !(v === 'false' || v === '0' || v === 'off');
  }

  // Lit la config depuis les attributs data-* (usage sans JavaScript)
  function readDataset(el) {
    var d = el.dataset || {};
    var o = {};
    if (d.anchors) o.anchors = d.anchors;
    if (d.targets) o.targets = d.targets;
    if (d.palette) o.palette = d.palette;
    if (d.mode) o.mode = d.mode;
    if (d.duration) o.duration = parseFloat(d.duration);
    if (d.pauseAtEnd) o.pauseAtEnd = parseFloat(d.pauseAtEnd);
    if (d.loop != null) o.loop = parseBool(d.loop, true);
    if (d.autoplay != null) o.autoplay = parseBool(d.autoplay, true);
    if (d.transparent != null) o.transparent = parseBool(d.transparent, false);
    if (d.grain) o.grain = parseFloat(d.grain);
    if (d.viscosity) o.viscosity = parseFloat(d.viscosity);
    if (d.agitation) o.agitation = parseFloat(d.agitation);
    if (d.haloScale) o.haloScale = parseFloat(d.haloScale);
    var c = {};
    if (d.colorTop) c.top = d.colorTop;
    if (d.colorMid) c.mid = d.colorMid;
    if (d.colorBottom) c.bottom = d.colorBottom;
    if (d.colorBackground) c.background = d.colorBackground;
    if (Object.keys(c).length) o.colors = c;
    return o;
  }

  // ==========================================================================
  // CLASSE PRINCIPALE
  // ==========================================================================
  function FluidMerge(container, options) {
    var el = resolveEl(container);
    if (!el) throw new Error('FluidMerge : conteneur introuvable (' + container + ')');
    if (el.__fluidMerge) el.__fluidMerge.destroy();
    el.__fluidMerge = this;

    this.el = el;
    var o = this.opts = Object.assign({}, DEFAULTS, readDataset(el), options || {});

    this._colors = Object.assign({}, PALETTES[o.palette] || PALETTES.argile, o.colors || {});
    this._rgb = null;
    this._applyColors();

    this._anchors = this._resolveNodes(o.anchors, 'data-fluid-anchor');
    this._targets = this._resolveNodes(o.targets, 'data-fluid-target');

    this._elapsed = 0;
    this._clock = 0;
    this._manual = 0;
    this._playing = o.autoplay !== false;
    this._visible = true;
    this._destroyed = false;
    this._raf = 0;
    this._pending = 0;
    this._last = null;
    this._layout = null;
    this._layoutDirty = true;
    this._listeners = [];
    this._observers = [];
    this.supported = false;

    this._loop = this._loop.bind(this);

    if (this._anchors.length < 2) {
      console.warn('FluidMerge : 2 ancres sont nécessaires (option "anchors" ou attributs data-fluid-anchor).');
      return;
    }

    this._reduced = !!(o.respectReducedMotion && window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    this._setupContainer();
    if (!this._initGL()) { this._fallback(); return; }
    this.supported = true;
    this._bindEvents();
    this._updateLoop();
    this._schedule();
  }

  var P = FluidMerge.prototype;

  P._resolveNodes = function (list, attr) {
    var self = this, nodes = [];
    if (Array.isArray(list)) nodes = list.map(function (r) { return resolveEl(r, self.el); });
    else if (typeof list === 'string') nodes = list.split(',').map(function (s) { return resolveEl(s.trim(), self.el); });
    if (!nodes.filter(Boolean).length) nodes = Array.prototype.slice.call(this.el.querySelectorAll('[' + attr + ']'));
    return nodes.filter(Boolean).slice(0, 2);
  };

  P._applyColors = function () {
    var c = this._colors;
    this._rgb = {
      top: hexToRgb(c.top), mid: hexToRgb(c.mid),
      bottom: hexToRgb(c.bottom), bg: hexToRgb(c.background)
    };
  };

  P._setupContainer = function () {
    var cs = getComputedStyle(this.el);
    this._saved = { position: this.el.style.position, isolation: this.el.style.isolation };
    if (cs.position === 'static') this.el.style.position = 'relative';
    this.el.style.isolation = 'isolate';

    var cv = this.canvas = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.setAttribute('data-fluid-canvas', '');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;' +
      'pointer-events:none;z-index:' + this.opts.zIndex + ';';
    this.el.insertBefore(cv, this.el.firstChild);
  };

  P._initGL = function () {
    var o = this.opts;
    var gl = this.gl = this.canvas.getContext('webgl', {
      antialias: true, alpha: !!o.transparent, premultipliedAlpha: true
    });
    if (!gl) return false;

    function make(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('FluidMerge shader :', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    var vs = make(gl.VERTEX_SHADER, VERT);
    var fs = make(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    var prog = this._program = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('FluidMerge link :', gl.getProgramInfoLog(prog));
      return false;
    }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var names = ['resolution', 'time', 'progress', 'pos1', 'pos2', 'target1', 'target2', 'radius', 'halo',
      'viscosity', 'agitation', 'grain', 'transparent', 'colorTop', 'colorMid', 'colorBottom', 'bgColor'];
    var u = this._u = {};
    names.forEach(function (n) { u[n] = gl.getUniformLocation(prog, 'u_' + n); });
    return true;
  };

  // Pas de WebGL : on garde au moins le fond de couleur
  P._fallback = function () {
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    if (!this.opts.transparent) this.el.style.backgroundColor = this._colors.background;
  };

  P._bindEvents = function () {
    var self = this;
    function on(target, type, fn, opt) {
      target.addEventListener(type, fn, opt);
      self._listeners.push([target, type, fn, opt]);
    }
    function dirty() { self._layoutDirty = true; self._schedule(); }

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(dirty);
      ro.observe(this.el);
      this._anchors.concat(this._targets).forEach(function (n) { ro.observe(n); });
      this._observers.push(ro);
    } else {
      on(window, 'resize', dirty);
    }
    on(window, 'load', dirty);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(dirty);

    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        self._visible = entries[entries.length - 1].isIntersecting;
        self._updateLoop();
        if (self._visible) self._schedule();
      }, { rootMargin: '100px' });
      io.observe(this.el);
      this._observers.push(io);
    }

    if (this.opts.mode === 'scroll') on(window, 'scroll', function () { self._schedule(); }, { passive: true });

    if (window.matchMedia && this.opts.respectReducedMotion) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      var h = function () { self._reduced = mq.matches; self._updateLoop(); self._schedule(); };
      if (mq.addEventListener) on(mq, 'change', h);
    }

    on(this.canvas, 'webglcontextlost', function (e) {
      e.preventDefault();
      if (self._raf) { cancelAnimationFrame(self._raf); self._raf = 0; }
    });
    on(this.canvas, 'webglcontextrestored', function () {
      if (self._initGL()) { self._layoutDirty = true; self._updateLoop(); self._schedule(); }
    });
  };

  // ---- Mesure des éléments, relative au conteneur --------------------------
  P._measure = function () {
    var cr = this.el.getBoundingClientRect();
    if (!cr.width || !cr.height) return false;

    var dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr);
    var w = Math.max(1, Math.round(cr.width * dpr));
    var h = Math.max(1, Math.round(cr.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);

    function info(n) {
      var r = n.getBoundingClientRect();
      return {
        x: (r.left + r.width / 2 - cr.left) / cr.width,
        y: 1 - (r.top + r.height / 2 - cr.top) / cr.height,
        r: Math.min(r.width, r.height) / 2 / cr.height
      };
    }
    var a = info(this._anchors[0]), b = info(this._anchors[1]);
    var t1, t2;
    if (this._targets.length === 2) { t1 = info(this._targets[0]); t2 = info(this._targets[1]); }
    else { t1 = { x: b.x, y: a.y }; t2 = { x: a.x, y: b.y }; }   // diagonale opposée par défaut

    this._layout = { a: a, b: b, t1: t1, t2: t2, radius: (a.r + b.r) / 2, w: w, h: h };
    this._layoutDirty = false;
    return true;
  };

  // ---- Progression ---------------------------------------------------------
  P._scrollProgress = function () {
    var r = this.el.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var s = this.opts.scrollStart * vh, e = this.opts.scrollEnd * vh;
    return clamp01((s - r.top) / (s - e + r.height));
  };

  P._progressNow = function () {
    if (this._reduced) return 0;
    var o = this.opts;
    if (o.mode === 'scroll') return this._scrollProgress();
    if (o.mode === 'manual') return this._manual;
    return clamp01(this._elapsed / o.duration);
  };

  // ---- Rendu ---------------------------------------------------------------
  P._draw = function () {
    if (this._destroyed || !this.supported || !this.gl || this.gl.isContextLost()) return;
    if ((this._layoutDirty || this.opts.trackLayout || !this._layout) && !this._measure()) return;

    var gl = this.gl, u = this._u, L = this._layout, o = this.opts, c = this._rgb;
    gl.uniform2f(u.resolution, L.w, L.h);
    gl.uniform1f(u.time, this._reduced ? 0 : this._clock);
    gl.uniform1f(u.progress, this._progressNow());
    gl.uniform2f(u.pos1, L.a.x, L.a.y);
    gl.uniform2f(u.pos2, L.b.x, L.b.y);
    gl.uniform2f(u.target1, L.t1.x, L.t1.y);
    gl.uniform2f(u.target2, L.t2.x, L.t2.y);
    gl.uniform1f(u.radius, L.radius);
    gl.uniform1f(u.halo, o.haloScale);
    gl.uniform1f(u.viscosity, o.viscosity);
    gl.uniform1f(u.agitation, o.agitation);
    gl.uniform1f(u.grain, o.grain);
    gl.uniform1f(u.transparent, o.transparent ? 1 : 0);
    gl.uniform3fv(u.colorTop, c.top);
    gl.uniform3fv(u.colorMid, c.mid);
    gl.uniform3fv(u.colorBottom, c.bottom);
    gl.uniform3fv(u.bgColor, c.bg);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  P._shouldRun = function () {
    return this.supported && !this._destroyed && this._visible && !this._reduced;
  };

  P._updateLoop = function () {
    if (this._shouldRun()) {
      if (!this._raf) { this._last = null; this._raf = requestAnimationFrame(this._loop); }
    } else if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  };

  P._loop = function (ts) {
    this._raf = 0;
    if (!this._shouldRun()) return;
    if (this._last == null) this._last = ts;
    var dt = Math.min((ts - this._last) / 1000, 0.1);
    this._last = ts;

    var o = this.opts;
    this._clock += dt * o.waveSpeed;
    if (o.mode === 'time' && this._playing) {
      this._elapsed += dt;
      if (o.loop && this._elapsed >= o.duration + o.pauseAtEnd) this._elapsed = 0;
    }
    this._draw();
    this._raf = requestAnimationFrame(this._loop);
  };

  // Rendu unique quand la boucle ne tourne pas (redimensionnement, image fixe…)
  P._schedule = function () {
    var self = this;
    if (this._raf || this._pending || !this.supported) return;
    this._pending = requestAnimationFrame(function () { self._pending = 0; self._draw(); });
  };

  // ==========================================================================
  // API PUBLIQUE
  // ==========================================================================
  P.play = function () { this._playing = true; this._updateLoop(); return this; };
  P.pause = function () { this._playing = false; return this; };
  P.restart = function () { this._elapsed = 0; this._playing = true; this._updateLoop(); this._schedule(); return this; };

  P.setProgress = function (p) {
    p = clamp01(p);
    this._manual = p;
    this._elapsed = p * this.opts.duration;
    this._schedule();
    return this;
  };
  P.getProgress = function () { return this._progressNow(); };

  P.setPalette = function (name) {
    if (!PALETTES[name]) { console.warn('FluidMerge : palette inconnue "' + name + '"'); return this; }
    return this.setColors(PALETTES[name]);
  };
  P.setColors = function (colors) {
    Object.assign(this._colors, colors);
    this._applyColors();
    this._schedule();
    return this;
  };
  P.setOptions = function (opts) { Object.assign(this.opts, opts); this._schedule(); return this; };
  P.refresh = function () { this._layoutDirty = true; this._schedule(); return this; };

  P.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._pending) cancelAnimationFrame(this._pending);
    this._observers.forEach(function (o) { o.disconnect(); });
    this._listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
    if (this.gl) {
      var ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    if (this._saved) {
      this.el.style.position = this._saved.position;
      this.el.style.isolation = this._saved.isolation;
    }
    delete this.el.__fluidMerge;
  };

  // ---- Fabriques statiques -------------------------------------------------
  FluidMerge.init = function (container, options) { return new FluidMerge(container, options); };
  FluidMerge.initAll = function (scope) {
    return Array.prototype.map.call((scope || document).querySelectorAll('[data-fluid-merge]'), function (el) {
      return new FluidMerge(el);
    });
  };
  FluidMerge.palettes = PALETTES;
  FluidMerge.defaults = DEFAULTS;

  // Auto-initialisation des éléments [data-fluid-merge]
  if (typeof document !== 'undefined') {
    var auto = function () { FluidMerge.initAll(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
    else auto();
  }

  return FluidMerge;
});
