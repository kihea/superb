/* Decrypt reveal.
 *
 * A card is drawn as ASCII cipher until the cursor comes near, and decodes
 * back into the real card behind a flickering wavefront. The glyphs are not
 * random: each cell picks the character whose ink best matches the shape of
 * the card underneath it, so a heading encrypts into heavy characters, body
 * text into light ones, and a word keeps its own outline while it is still
 * unreadable. Same idea as the hero's ASCII scene, applied to interface.
 *
 * This is @canvas-ui/decrypt-reveal-react's effect, written out for a page
 * that cannot install it, with its documented prop values kept:
 *
 *   radius 400   softness 0.5   cell 10   aspect 0.75   colored 1
 *   brightness 1 legibility 1   contrast 1 exposure 1   scramble 0.1
 *   scrambleSpeed 6  edgeWidth 0.2  edgeFlicker 1  edgeGlow 2
 *   edgeTint 0.75    passthrough 0.15  threshold 0.025  smoothing 0.2
 *
 * Three things differ, and each of them is forced.
 *
 * The package captures the real DOM into a texture with `drawElementImage()`
 * and `layoutsubtree` — html-in-canvas. Measured on 2026-08-04: undefined in
 * Chrome 148, undefined in Chromium 151, and a function only under
 * `--enable-blink-features=HTMLInCanvas`. Installed as shipped it would take
 * its own `supportsHtmlInCanvas()` branch, set uCrisp and draw nothing at all
 * for everyone who has not turned on a flag. So:
 *
 * - The cipher is matched against a redraw rather than a capture: every line
 *   of every text run repainted in its own font and colour, plus the boxes,
 *   rules and canvases around them. Same ink, same places.
 * - `aberration` does nothing. Splitting the revealed UI's channels needs to
 *   own those pixels. Here the real card is the real card — the cipher is
 *   painted over it and erased away, so the text underneath stays selectable,
 *   searchable and visible to a screen reader the whole time.
 * - `color` is the app's accent, not the docs' #4ade80. Everything here is
 *   cool neutrals plus oxide; green is the one light the brand has already
 *   turned down. CIPHER_COLOR, below, is the whole change.
 *
 * And one deliberate departure. In the package the page stays encrypted for
 * good, which on a page of text means the reader has to hunt a cursor over it
 * to find out what it says. Here the cipher is a layer with a life: the cursor
 * opens its disc through it, and the layer itself comes off — on a click, or
 * five seconds after the card arrived, whichever happens first — leaving the
 * card plain from then on. Hovering does not end it. A card that resolved
 * every time a pointer crossed it would never be seen as cipher at all.
 */
(function () {
  'use strict';

  var CIPHER_COLOR = [224, 119, 107]; // --accent-lit
  var BACKGROUND = [5, 6, 9]; // the page ground: what counts as empty space

  /* The docs' 400 is a whole-page radius; on a card it decodes almost the
     whole thing at once and there is nothing left to sweep. This is the one
     number worth living with for a while. */
  var RADIUS = 190;
  var SOFTNESS = 0.5;
  var CELL = 10;
  var ASPECT = 0.75;
  var COLORED = 1;
  var BRIGHTNESS = 1;
  var LEGIBILITY = 1;
  var CONTRAST = 1;
  var EXPOSURE = 1;
  var SCRAMBLE = 0.1;
  var SCRAMBLE_SPEED = 6;
  var EDGE_WIDTH = 0.2;
  var EDGE_FLICKER = 1;
  var EDGE_GLOW = 2;
  var EDGE_TINT = 0.75;
  var PASSTHROUGH = 0.22;
  var THRESHOLD = 0.025;
  var SMOOTHING = 0.2;

  /* A card stays cipher until it is clicked, or until it has been on screen
     long enough that the reader is plainly waiting on it. Long enough to play
     with the cursor first, short enough that nobody is kept from the words. */
  var DWELL_MS = 5000;
  /* The cipher is a layer over the card, so it leaves the way a layer does —
     it fades off, still churning, and the card is already underneath it. */
  var FADE_MS = 620;

  /* Printable ASCII, the package's default charset. The space is index 0 and
     means "nothing here", which is what an empty cell picks. */
  var GLYPHS = (function () {
    var out = [];
    for (var c = 32; c <= 126; c++) out.push(String.fromCharCode(c));
    return out;
  })();

  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;


  var CELL_W = CELL * ASPECT;
  var FONT = '600 ' + CELL * 0.92 + 'px "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  var LUMA = [0.299, 0.587, 0.114];

  /* the six regions a glyph's ink is measured in, and a cell's is sampled in:
     two columns, three rows */
  function regionOf(fx, fy) {
    return (fy < 0.41 ? 0 : fy < 0.71 ? 2 : 4) + (fx < 0.5 ? 0 : 1);
  }

  function hash(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /* ---- the glyph table --------------------------------------------------
     Every character's ink measured over the same six regions a cell is
     sampled in, normalised so a cell's field can be matched against it. */

  var TABLE = null;

  function buildTable() {
    var SS = 4;
    var w = Math.round(CELL_W * SS);
    var h = Math.round(CELL * SS);
    var cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    var g = cv.getContext('2d', { willReadFrequently: true });
    var raw = [];
    for (var i = 0; i < GLYPHS.length; i++) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#fff';
      g.font = '600 ' + CELL * 0.92 * SS + 'px "Geist Mono", ui-monospace, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(GLYPHS[i], w / 2, h * 0.54);
      var d = g.getImageData(0, 0, w, h).data;
      var v = [0, 0, 0, 0, 0, 0];
      var n = [0, 0, 0, 0, 0, 0];
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var k = regionOf(x / w, y / h);
          v[k] += d[(y * w + x) * 4 + 3] / 255;
          n[k]++;
        }
      }
      raw.push(v.map(function (s, j) { return s / n[j]; }));
    }
    var mean = raw.map(function (v) { return (v[0] + v[1] + v[2] + v[3] + v[4] + v[5]) / 6; });
    var peak = Math.max.apply(null, mean) || 1;
    TABLE = raw.map(function (v, i) {
      return {
        i: i,
        dens: mean[i] / peak,
        prof: mean[i] > 0.001 ? v.map(function (x) { return x / mean[i]; }) : [1, 1, 1, 1, 1, 1],
      };
    });
  }

  function pickGlyph(v) {
    var L = (v[0] + v[1] + v[2] + v[3] + v[4] + v[5]) / 6;
    var prof;
    if (L > 0.02) {
      prof = [v[0] / L, v[1] / L, v[2] / L, v[3] / L, v[4] / L, v[5] / L];
      var m = 0;
      for (var i = 0; i < 6; i++) if (prof[i] > m) m = prof[i];
      for (i = 0; i < 6; i++) prof[i] = Math.pow(prof[i] / m, CONTRAST) * m;
    } else prof = [1, 1, 1, 1, 1, 1];
    var D = Math.pow(Math.min(1, L), 0.86);
    var best = 0;
    var bd = Infinity;
    for (var t = 1; t < TABLE.length; t++) {
      var e = TABLE[t];
      var dd = e.dens - D;
      var d = 18 * dd * dd;
      for (var k = 0; k < 6; k++) {
        var q = e.prof[k] - prof[k];
        d += (q * q) / 6;
      }
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  /* ---- repainting the card ---------------------------------------------
     A raster of what the card looks like, drawn rather than captured: boxes
     and rules first, then every line of text in its own font and colour. */

  function alphaOf(css) {
    if (!css || css === 'transparent') return 0;
    var m = /rgba?\(([^)]+)\)/.exec(css);
    if (!m) return 1;
    var p = m[1].split(',');
    return p.length > 3 ? parseFloat(p[3]) : 1;
  }

  /* The card's own frame is part of the card, so it is ciphered with
     everything else: the rule around a tile comes back as a run of ASCII and
     resolves into a rule again under the cursor. The veil is sized to the
     border box for this, not to the padding box. */
  function paintBoxes(root, g, base) {
    var rcs = getComputedStyle(root);
    var rbw = parseFloat(rcs.borderTopWidth) || 0;
    if (rbw > 0 && alphaOf(rcs.borderTopColor) > 0.02) {
      var rr = root.getBoundingClientRect();
      g.strokeStyle = rcs.borderTopColor;
      g.lineWidth = Math.max(rbw, 1);
      g.strokeRect(0.5, 0.5, rr.width - 1, rr.height - 1);
    }
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.classList.contains('sb-crypt__veil')) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      var x = r.left - base.left;
      var y = r.top - base.top;
      var cs = getComputedStyle(el);
      if (alphaOf(cs.backgroundColor) > 0.02) {
        g.fillStyle = cs.backgroundColor;
        g.fillRect(x, y, r.width, r.height);
      }
      var bw = parseFloat(cs.borderTopWidth) || 0;
      if (bw > 0 && alphaOf(cs.borderTopColor) > 0.04) {
        g.strokeStyle = cs.borderTopColor;
        g.lineWidth = Math.max(bw, 1);
        g.strokeRect(x + 0.5, y + 0.5, r.width - 1, r.height - 1);
      }
      var tag = el.tagName;
      if (tag === 'CANVAS' || tag === 'IMG') {
        try { g.drawImage(el, x, y, r.width, r.height); } catch (e) {}
      } else if (tag === 'svg') {
        // an icon is a shape, not a box: a soft block stands in for it
        g.fillStyle = cs.color || '#fff';
        g.globalAlpha = 0.5;
        g.fillRect(x + r.width * 0.15, y + r.height * 0.15, r.width * 0.7, r.height * 0.7);
        g.globalAlpha = 1;
      }
    }
  }

  /* The offsets at which each visual line of a text node begins. getClientRects
     hands back one rect per line in order, so the split points are found by
     asking how many lines the first n characters take. */
  function lineStarts(node, lines) {
    var text = node.nodeValue;
    var range = document.createRange();
    var count = function (n) {
      range.setStart(node, 0);
      range.setEnd(node, n);
      return range.getClientRects().length;
    };
    var starts = [0];
    for (var line = 1; line < lines; line++) {
      var lo = starts[line - 1];
      var hi = text.length;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (count(mid) > line) hi = mid; else lo = mid + 1;
      }
      starts.push(lo);
    }
    starts.push(text.length);
    return starts;
  }

  function paintText(root, g, base) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        return /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    var range = document.createRange();
    var node;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent) continue;
      var cs = getComputedStyle(parent);
      range.selectNodeContents(node);
      var rects = range.getClientRects();
      if (!rects.length) continue;
      var starts = rects.length > 1 ? lineStarts(node, rects.length) : [0, node.nodeValue.length];
      g.font = cs.font || cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      g.fillStyle = cs.color;
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (r.width < 1 || r.height < 1) continue;
        var s = node.nodeValue.slice(starts[i], starts[i + 1]);
        if (!/\S/.test(s)) continue;
        g.fillText(s, r.left - base.left, r.top - base.top + r.height / 2);
      }
    }
  }

  /* ---- one card --------------------------------------------------------- */

  var cards = [];
  var pointer = { x: -1e5, y: -1e5, tx: -1e5, ty: -1e5, active: 0, target: 0, seen: false };

  function build(card) {
    var el = card.el;
    // the border box, so the frame is ciphered too
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    if (!w || !h) return false;
    if (!TABLE) buildTable();

    card.w = w;
    card.h = h;
    card.cols = Math.ceil(w / CELL_W);
    card.rows = Math.ceil(h / CELL);

    var dpr = Math.min(2, window.devicePixelRatio || 1);
    card.cv.width = Math.round(w * dpr);
    card.cv.height = Math.round(h * dpr);
    card.cv.style.width = w + 'px';
    card.cv.style.height = h + 'px';
    var ctx = card.cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'middle';
    ctx.font = FONT;
    card.ctx = ctx;

    // the redraw the cipher is matched against
    var src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    var g = src.getContext('2d', { willReadFrequently: true });
    var base = el.getBoundingClientRect();
    paintBoxes(el, g, base);
    paintText(el, g, base);
    var px = g.getImageData(0, 0, w, h).data;

    var n = card.cols * card.rows;
    card.glyph = new Uint8Array(n);
    card.r = new Uint8Array(n);
    card.gc = new Uint8Array(n);
    card.b = new Uint8Array(n);
    card.lum = new Float32Array(n);
    card.base = new Array(n);

    var bg = BACKGROUND;
    for (var cy = 0; cy < card.rows; cy++) {
      for (var cx = 0; cx < card.cols; cx++) {
        var x0 = Math.round(cx * CELL_W);
        var y0 = cy * CELL;
        var x1 = Math.min(w, Math.round((cx + 1) * CELL_W));
        var y1 = Math.min(h, y0 + CELL);
        /* Each region keeps its brightest pixel, not its average. A card's
           rule is one pixel in a ten-pixel cell: averaged it is nothing and
           the frame vanishes, so a ciphered card would sit in open space with
           no edge. Kept at its peak it earns a glyph, and the border reads as
           a run of ASCII that resolves back into a rule. */
        var v = [0, 0, 0, 0, 0, 0];
        var topLev = 0;
        var levSum = 0;
        var pxCount = 0;
        var tr = 0, tg = 0, tb = 0;
        for (var y = y0; y < y1; y++) {
          for (var x = x0; x < x1; x++) {
            var o = (y * w + x) * 4;
            var a = px[o + 3] / 255;
            var pr = px[o], pg = px[o + 1], pb = px[o + 2];
            var lev =
              (Math.abs(pr - bg[0]) * LUMA[0] +
                Math.abs(pg - bg[1]) * LUMA[1] +
                Math.abs(pb - bg[2]) * LUMA[2]) /
              255 *
              a;
            var k = regionOf((x - x0) / Math.max(x1 - x0, 1), (y - y0) / Math.max(y1 - y0, 1));
            if (lev > v[k]) v[k] = lev;
            levSum += lev;
            pxCount++;
            if (lev > topLev) { topLev = lev; tr = pr; tg = pg; tb = pb; }
          }
        }
        var i = cy * card.cols + cx;
        var peak = 0;
        for (var k2 = 0; k2 < 6; k2++) {
          v[k2] = Math.min(1, v[k2] * EXPOSURE);
          if (v[k2] > peak) peak = v[k2];
        }
        if (peak < THRESHOLD) { card.glyph[i] = 0; continue; }

        /* A glyph covers far less of its cell than the letter it stands for
           does, so matching raw coverage picks periods for everything and the
           cipher goes to dust. A cell whose brightest pixel stands well clear
           of its own average is a cell with a stroke through it, and its field
           is lifted toward solid before the shape is matched — which is what
           makes a heading encrypt heavy and a caption encrypt light. */
        var inkLev = topLev * EXPOSURE;
        var meanLev = (levSum / Math.max(pxCount, 1)) * EXPOSURE;
        var sharp = inkLev / Math.max(meanLev, 1e-4);
        var solid = smoothstep(THRESHOLD, THRESHOLD * 1.6, inkLev);
        var lift = smoothstep(1.5, 3, sharp) * solid;
        var lifted = peak + (1 - peak) * lift;
        for (k2 = 0; k2 < 6; k2++) {
          v[k2] = Math.pow(Math.min(v[k2] / peak, 1), CONTRAST) * lifted;
        }
        card.glyph[i] = pickGlyph(v);

        /* Legibility: a cell whose ink is barely off the ground would encrypt
           into something nobody can see. Its deviation is scaled up until it
           clears a floor, which is what keeps subtle interface readable while
           it is still cipher. */
        var dr = tr - bg[0], dg = tg - bg[1], db = tb - bg[2];
        var mag = (Math.abs(dr) * LUMA[0] + Math.abs(dg) * LUMA[1] + Math.abs(db) * LUMA[2]) / 255;
        var boost = Math.max(1, Math.min(32, (LEGIBILITY * 0.75) / Math.max(mag, 0.01)));
        var cr = Math.max(0, Math.min(255, bg[0] + dr * boost));
        var cg = Math.max(0, Math.min(255, bg[1] + dg * boost));
        var cb = Math.max(0, Math.min(255, bg[2] + db * boost));
        var sig = Math.min(1, mag * 1.6);
        var mono = CIPHER_COLOR.map(function (c) { return c * (0.35 + 0.85 * sig); });
        cr = mono[0] + (cr - mono[0]) * COLORED;
        cg = mono[1] + (cg - mono[1]) * COLORED;
        cb = mono[2] + (cb - mono[2]) * COLORED;
        cr = bg[0] + (cr - bg[0]) * BRIGHTNESS;
        cg = bg[1] + (cg - bg[1]) * BRIGHTNESS;
        cb = bg[2] + (cb - bg[2]) * BRIGHTNESS;
        card.r[i] = Math.max(0, Math.min(255, cr)) | 0;
        card.gc[i] = Math.max(0, Math.min(255, cg)) | 0;
        card.b[i] = Math.max(0, Math.min(255, cb)) | 0;
        card.lum[i] = (card.r[i] * LUMA[0] + card.gc[i] * LUMA[1] + card.b[i] * LUMA[2]) / 255;
        card.base[i] = 'rgb(' + card.r[i] + ',' + card.gc[i] + ',' + card.b[i] + ')';
      }
    }
    card.built = true;
    return true;
  }

  function draw(card, now) {
    var ctx = card.ctx;
    if (!ctx) return;
    var w = card.w, h = card.h, cols = card.cols;
    var r = card.el.getBoundingClientRect();
    var px = pointer.x - r.left;
    var py = pointer.y - r.top;
    var active = pointer.active;

    var inner = RADIUS * (1 - SOFTNESS);
    var mid = (inner + RADIUS) / 2;
    var bandW = Math.max(RADIUS * EDGE_WIDTH * 0.5, 6);

    var fade = card.openedAt ? Math.max(0, 1 - (now - card.openedAt) / FADE_MS) : 1;

    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = fade;
    ctx.fillStyle =
      'rgba(' + BACKGROUND[0] + ',' + BACKGROUND[1] + ',' + BACKGROUND[2] + ',' + (1 - PASSTHROUGH) + ')';
    ctx.fillRect(0, 0, w, h);

    var tick = Math.floor(now / (1000 / SCRAMBLE_SPEED));
    var reroll = tick !== card.tick;
    card.tick = tick;

    /* Cells are drawn in runs of one colour per row, the way the hero's field
       is: a row of body text is one fillText, not forty. */
    for (var cy = 0; cy < card.rows; cy++) {
      var yy = cy * CELL + CELL * 0.54;
      var run = '';
      var runX = 0;
      var runCol = null;
      for (var cx = 0; cx < cols; cx++) {
        var i = cy * cols + cx;
        var gi = card.glyph[i];
        var col = null;
        var chr = ' ';
        if (gi) {
          var mx = cx * CELL_W + CELL_W / 2;
          var my = cy * CELL + CELL / 2;
          var dx = mx - px;
          var dy = my - py;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var e = active * (1 - smoothstep(inner, RADIUS, dist));
          if (e > 0.995) {
            gi = 0;
          } else {
            var bd = dist - mid;
            var ring = active * Math.exp((-bd * bd) / (2 * bandW * bandW));
            var g2 = gi;
            if (ring > 0.02 && EDGE_FLICKER > 0) {
              if (hash(i * 5.3 + Math.floor(now * SCRAMBLE_SPEED * 0.004 * (1 + ring * 2.5)) + card.seed) < ring * EDGE_FLICKER) {
                g2 = 1 + ((hash(i * 3.7 + now * 0.05 + card.seed) * (GLYPHS.length - 1)) | 0);
              }
            } else if (reroll && hash(i + tick * 0.913 + card.seed) < SCRAMBLE) {
              card.glyph[i] = 1 + ((hash(i * 3.1 + tick + card.seed) * (GLYPHS.length - 1)) | 0);
              g2 = card.glyph[i];
            }
            chr = GLYPHS[g2];
            if (ring > 0.02) {
              var t = ring * EDGE_TINT;
              var lum = card.lum[i];
              var cr = card.r[i] + (CIPHER_COLOR[0] * (0.6 + lum) - card.r[i]) * t;
              var cg = card.gc[i] + (CIPHER_COLOR[1] * (0.6 + lum) - card.gc[i]) * t;
              var cb = card.b[i] + (CIPHER_COLOR[2] * (0.6 + lum) - card.b[i]) * t;
              var gain = 1 + ring * EDGE_GLOW * 0.6;
              col =
                'rgb(' +
                clamp255(BACKGROUND[0] + (cr - BACKGROUND[0]) * gain) + ',' +
                clamp255(BACKGROUND[1] + (cg - BACKGROUND[1]) * gain) + ',' +
                clamp255(BACKGROUND[2] + (cb - BACKGROUND[2]) * gain) + ')';
            } else {
              col = card.base[i];
            }
          }
        }
        if (!gi) { chr = ' '; col = null; }
        if (col !== runCol) {
          if (runCol && /\S/.test(run)) {
            ctx.fillStyle = runCol;
            ctx.fillText(run, runX, yy);
          }
          run = '';
          runX = cx * CELL_W;
          runCol = col;
        }
        run += chr;
      }
      if (runCol && /\S/.test(run)) {
        ctx.fillStyle = runCol;
        ctx.fillText(run, runX, yy);
      }
    }

    // the reveal: cipher and ground erased together, the real card under it
    ctx.globalAlpha = 1;
    if (active > 0.002) {
      var grad = ctx.createRadialGradient(px, py, 0, px, py, RADIUS);
      grad.addColorStop(0, 'rgba(0,0,0,' + active + ')');
      grad.addColorStop(inner / RADIUS, 'rgba(0,0,0,' + active + ')');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = grad;
      ctx.fillRect(px - RADIUS, py - RADIUS, RADIUS * 2, RADIUS * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function clamp255(v) { return Math.max(0, Math.min(255, v)) | 0; }

  function smoothstep(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  /* ---- the loop --------------------------------------------------------- */

  var running = false;
  var lastTime = 0;

  function frame(now) {
    running = false;
    var dt = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    var k = 1 - Math.exp(-dt / Math.max(SMOOTHING, 1e-4));
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    pointer.active += (pointer.target - pointer.active) * k;

    var live = 0;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.done || !card.visible) continue;
      if (!card.built && !build(card)) continue;
      if (!card.openedAt && card.arrived && now - card.arrived > DWELL_MS) card.openedAt = now;
      draw(card, now);
      // the layer has faded off; there was never anything under it but the
      // card itself, so it goes
      if (card.openedAt && now - card.openedAt > FADE_MS) {
        card.done = true;
        card.el.classList.add('sb-crypt--open');
        if (card.cv.parentNode) card.cv.parentNode.removeChild(card.cv);
        continue;
      }
      live++;
    }
    if (live) start();
  }

  function start() {
    if (running) return;
    running = true;
    if (!lastTime) lastTime = performance.now();
    requestAnimationFrame(frame);
  }

  /* ---- wiring ----------------------------------------------------------- */

  function attach(el) {
    if (el.dataset.crypt) return;
    el.dataset.crypt = '1';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    var cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.className = 'sb-crypt__veil';
    el.appendChild(cv);
    var card = { el: el, cv: cv, visible: false, built: false, tick: -1, seed: cards.length * 137.3 };
    cards.push(card);

    new IntersectionObserver(
      function (entries) {
        card.visible = entries[entries.length - 1].isIntersecting;
        if (card.visible) {
          if (!card.arrived) card.arrived = performance.now();
          start();
        }
      },
      { threshold: 0.15 },
    ).observe(el);

    /* Clicking a card decrypts it there and then. So does tabbing into it,
       which is the same intent arriving from a keyboard. Hovering does not —
       the cursor opens its disc and closes it again, and a card that resolved
       every time a pointer crossed it would never be seen as cipher at all. */
    var open = function () {
      if (!card.done && !card.openedAt) card.openedAt = performance.now();
      start();
    };
    el.addEventListener('click', open);
    el.addEventListener('focusin', open);

    /* The miniatures grow their own markup after the page settles, and a
       gloss card opens a definition under the sentence. A cipher measured
       before that is a cipher the wrong size for the card it covers. */
    if (window.ResizeObserver) {
      var rt;
      new ResizeObserver(function () {
        clearTimeout(rt);
        rt = setTimeout(function () {
          if (!card.done && (card.w !== el.offsetWidth || card.h !== el.offsetHeight)) {
            card.built = false;
            start();
          }
        }, 160);
      }).observe(el);
    }
  }

  function remeasure() {
    for (var i = 0; i < cards.length; i++) if (!cards[i].done) cards[i].built = false;
    start();
  }

  function boot() {
    /* Motion turned down: the page is simply the page. A phone still gets the
       effect, because a card decrypts itself and never needed the cursor. */
    if (REDUCED) {
      Array.prototype.forEach.call(document.querySelectorAll('.sb-crypt'), function (el) {
        el.classList.add('sb-crypt--open');
      });
      return;
    }
    Array.prototype.forEach.call(document.querySelectorAll('.sb-crypt'), attach);

    document.addEventListener(
      'pointermove',
      function (e) {
        if (e.pointerType === 'touch') return;
        if (!pointer.seen) {
          pointer.seen = true;
          pointer.x = e.clientX;
          pointer.y = e.clientY;
        }
        pointer.tx = e.clientX;
        pointer.ty = e.clientY;
        pointer.target = 1;
        start();
      },
      { passive: true },
    );
    document.addEventListener('pointerleave', function () { pointer.target = 0; start(); });
    // scrolling moves the page under a still cursor, which moves the disc
    window.addEventListener('scroll', start, { passive: true });

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(remeasure, 220);
    });
    // the demos mount their own markup a beat after the page settles, and a
    // card measured before that is a card with a hole in its cipher
    setTimeout(remeasure, 1500);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    start();
  }

  var tries = 0;
  var wait = setInterval(function () {
    // same wait as demos.js: the dc runtime commits the tree in passes, and a
    // canvas parented to a node the runtime is about to replace is a canvas
    // that vanishes
    var settled = document.querySelector('section canvas');
    if (!settled && ++tries < 100) return;
    clearInterval(wait);
    setTimeout(boot, 500);
  }, 120);
})();
