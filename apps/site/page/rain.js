/* Glyph rain.
 *
 * The page ground carries three lights — oxide, harbour blue and the games'
 * violet. This puts them in motion behind everything: columns of ASCII
 * falling slowly, each column in one of the three, at an alpha low enough
 * that you read it as texture and not as an effect. It is the same alphabet
 * and the same face the hero's scene and the cards' cipher use, so the site
 * has one material rather than three tricks.
 *
 * The canvas is transparent and every step redraws it. The usual trick —
 * eroding the old frame with a low-alpha destination-out fill — cannot be
 * used here: alpha is eight bits, a fifth of a percent rounds to nothing, and
 * what should fade to clear stops at one or two and stays there. On a
 * transparent canvas that residue never washes out, and the page collects a
 * grey crust of dead glyphs. So each column carries its own trail and is
 * drawn in full, which at this density is a few hundred single characters a
 * step and exact at the tail.
 *
 * It sits at z-index -1 inside the ground, which is an isolated stacking
 * context. That puts it above the ground's own background and below every
 * section — including the hero, whose opaque ground hides the rain entirely.
 * The ASCII scene up there is the page's picture, and nothing goes over it.
 */
(function () {
  'use strict';

  /* The three lights of the ground, each already mixed most of the way down
     into it. A saturated glyph on a near-black page is a bright mark however
     little alpha it carries — the colour has to come down as well as the
     opacity, or the rain sits on the page instead of in it. */
  var GROUND = [5, 6, 9];
  var TOWARD_GROUND = 0.55;
  var LIGHTS = [
    [200, 86, 75], // --accent, oxide
    [63, 136, 209], // harbour blue
    [150, 124, 214], // violet
  ].map(function (c) {
    return c.map(function (v, i) {
      return Math.round(GROUND[i] + (v - GROUND[i]) * (1 - TOWARD_GROUND));
    });
  });

  var FONT_PX = 11;
  var ROW = 14; // one glyph row, CSS px
  var HEAD_ALPHA = 0.13; // the brightest a glyph ever gets
  var STEP_MS = 1000 / 30;
  var MIN_ROWS_PER_S = 2.2;
  var MAX_ROWS_PER_S = 6.5;
  var MIN_TRAIL = 7;
  var MAX_TRAIL = 20;
  var DENSITY = 0.3; // share of columns falling at any moment
  var REROLL = 0.1; // chance a head is a fresh character

  var GLYPHS = (function () {
    var out = '';
    for (var c = 33; c <= 126; c++) out += String.fromCharCode(c);
    return out;
  })();

  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var cv, ctx, colW, cols, rows, columns, timer, visible = true;

  function glyph() {
    return GLYPHS[(Math.random() * GLYPHS.length) | 0];
  }

  /* `spread` seeds the first fall anywhere down the page, so the field is
     already running when it is first seen rather than arriving as one wave
     off the top edge. */
  function seed(col, spread) {
    col.trail = MIN_TRAIL + ((Math.random() * (MAX_TRAIL - MIN_TRAIL)) | 0);
    col.row = spread ? Math.random() * (rows + col.trail) : -Math.random() * 26;
    col.speed = MIN_ROWS_PER_S + Math.random() * (MAX_ROWS_PER_S - MIN_ROWS_PER_S);
    col.light = LIGHTS[(Math.random() * LIGHTS.length) | 0];
    col.alpha = HEAD_ALPHA * (0.45 + Math.random() * 0.55);
    col.buf = [];
    for (var i = 0; i <= col.trail; i++) col.buf.push(glyph());
    col.head = 0;
  }

  // the character standing k rows above the head
  function charAt(col, k) {
    return col.buf[(col.head - k + col.buf.length * 2) % col.buf.length];
  }

  function build() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    cv.width = w;
    cv.height = h;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    ctx = cv.getContext('2d');
    ctx.font = FONT_PX + 'px "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'middle';
    colW = ctx.measureText('M').width || FONT_PX * 0.6;
    cols = Math.ceil(w / colW);
    rows = Math.ceil(h / ROW);
    columns = [];
    for (var i = 0; i < cols; i++) {
      var col = { on: Math.random() < DENSITY };
      seed(col, true);
      columns.push(col);
    }
  }

  function stop() {
    clearInterval(timer);
    timer = 0;
  }

  function step() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);

    for (var i = 0; i < cols; i++) {
      var col = columns[i];
      if (!col.on) {
        // a still column occasionally starts falling again, so the field
        // never settles into a pattern anyone could count
        if (Math.random() < 0.004) {
          col.on = true;
          seed(col, false);
        }
        continue;
      }
      var was = Math.floor(col.row);
      col.row += col.speed * (STEP_MS / 1000);
      var now = Math.floor(col.row);
      if (now > was) {
        col.head = (col.head + (now - was)) % col.buf.length;
        if (Math.random() < REROLL) col.buf[col.head] = glyph();
      }
      if (now - col.trail > rows) {
        col.on = Math.random() < DENSITY;
        seed(col, false);
        continue;
      }
      var l = col.light;
      var rgb = 'rgba(' + l[0] + ',' + l[1] + ',' + l[2] + ',';
      for (var k = 0; k <= col.trail; k++) {
        var row = now - k;
        if (row < 0) continue;
        if (row > rows) break;
        // the head is the brightest character; everything behind it falls
        // away on a curve, so a trail ends rather than stopping
        var a = col.alpha * Math.pow(1 - k / (col.trail + 1), 1.7);
        if (k === 0) a = col.alpha * 1.35;
        if (a < 0.004) break;
        ctx.fillStyle = rgb + a.toFixed(3) + ')';
        ctx.fillText(charAt(col, k), i * colW, row * ROW + ROW / 2);
      }
    }
  }

  /* Motion turned down: one still field, laid once. The lights are part of
     how the page looks, so they stay; only the falling stops. */
  function still() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (var i = 0; i < cols; i++) {
      var col = columns[i];
      if (!col.on) continue;
      var l = col.light;
      var rgb = 'rgba(' + l[0] + ',' + l[1] + ',' + l[2] + ',';
      for (var k = 0; k <= col.trail; k++) {
        var row = Math.floor(col.row) - k;
        if (row < 0 || row > rows) continue;
        var a = col.alpha * 0.7 * Math.pow(1 - k / (col.trail + 1), 1.7);
        if (a < 0.004) break;
        ctx.fillStyle = rgb + a.toFixed(3) + ')';
        ctx.fillText(charAt(col, k), i * colW, row * ROW + ROW / 2);
      }
    }
  }

  function run() {
    stop();
    if (REDUCED || !visible) return;
    timer = setInterval(step, STEP_MS);
  }

  function boot() {
    var ground = document.querySelector('.sb-ground');
    if (!ground || document.querySelector('.sb-rain')) return;
    cv = document.createElement('canvas');
    cv.className = 'sb-rain';
    cv.setAttribute('aria-hidden', 'true');
    ground.insertBefore(cv, ground.firstChild);
    build();
    if (REDUCED) {
      still();
      return;
    }
    run();

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        build();
        run();
      }, 250);
    });
    document.addEventListener('visibilitychange', function () {
      visible = !document.hidden;
      run();
    });
  }

  var tries = 0;
  var wait = setInterval(function () {
    // the dc runtime commits the tree in passes; a canvas parented to a node
    // it is about to replace is a canvas that vanishes
    var settled = document.querySelector('section canvas');
    if (!settled && ++tries < 100) return;
    clearInterval(wait);
    setTimeout(boot, 460);
  }, 120);
})();
