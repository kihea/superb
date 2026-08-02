/* The landing's working miniatures. Each figure on the page gets a small,
   true demo of the thing it claims: a shelf of real books, a real gloss
   card on a real sentence, one round of each game with answers the games'
   own data actually accepts. Everything here is hand-fed from shipped
   content (content/catalogue, content/challenges, the curated glosses) --
   nothing invented, nothing fetched.

   The page is rendered by the dc runtime, so mounts appear after React
   commits; boot polls for them the same way scene.js does. Reduced motion
   renders every demo in its finished state and starts no timers. */
(function () {
  'use strict';

  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- shared helpers ---------------------------------------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function typeInto(node, text, speed, done) {
    if (REDUCED) { node.textContent = text; if (done) done(); return; }
    node.textContent = '';
    var i = 0;
    var t = setInterval(function () {
      node.textContent = text.slice(0, ++i);
      if (i >= text.length) { clearInterval(t); if (done) done(); }
    }, speed || 34);
    return t;
  }

  /* ---- 1. the shelf: real books, one pulled at a time --------------- */

  // Real rows from content/catalogue/index-v1.json, spine shapes hand-set.
  var BOOKS = [
    { title: 'Dracula', author: 'Bram Stoker', w: 2, h: 6, g: '▓', c: 'var(--brand)' },
    { title: 'Emma', author: 'Jane Austen', w: 2, h: 5, g: '▒', c: 'rgba(246,238,226,.62)' },
    { title: 'The Souls of Black Folk', author: 'W. E. B. Du Bois', w: 3, h: 7, g: '█', c: 'rgba(246,238,226,.4)' },
    { title: 'Beowulf', author: 'translated by J. L. Hall', w: 2, h: 4, g: '░', c: 'rgba(217,106,99,.55)' },
    { title: 'The Count of Monte Cristo', author: 'Alexandre Dumas', w: 3, h: 6, g: '▓', c: 'rgba(246,238,226,.55)' },
    { title: 'Agamemnon', author: 'Aeschylus', w: 2, h: 5, g: '▒', c: 'var(--support)' },
    { title: 'The Cherry Orchard', author: 'Anton Chekhov', w: 2, h: 6, g: '░', c: 'rgba(246,238,226,.48)' }
  ];

  function buildShelf(mount) {
    var ROWS = 8, GAP = 1;
    var pre = el('pre', 'sb-demo-shelf__field');
    var caption = el('div', 'sb-demo-shelf__caption');
    var title = el('span', 'sb-demo-shelf__title');
    var author = el('span', 'sb-demo-shelf__author');
    caption.appendChild(title);
    caption.appendChild(author);
    mount.appendChild(pre);
    mount.appendChild(caption);

    function render(lifted) {
      var rows = [];
      for (var r = 0; r < ROWS; r++) rows.push([]);
      var col = 0;
      BOOKS.forEach(function (b, i) {
        var lift = i === lifted ? 1 : 0;
        for (var r = 0; r < ROWS - 1; r++) {
          var top = ROWS - 1 - b.h - lift;
          var ch = r >= top && r < ROWS - 1 - lift ? b.g : ' ';
          for (var w = 0; w < b.w; w++) {
            rows[r].push({ ch: ch, c: i === lifted ? '#FCF6EC' : b.c });
          }
        }
        for (var g = 0; g < GAP; g++) rows.forEach(function (row, ri) { if (ri < ROWS - 1) row.push({ ch: ' ', c: '' }); });
        col += b.w + GAP;
      });
      // the shelf itself
      rows[ROWS - 1] = [];
      for (var x = 0; x < col; x++) rows[ROWS - 1].push({ ch: '▁', c: 'rgba(246,238,226,.28)' });

      pre.innerHTML = '';
      rows.forEach(function (row) {
        var line = document.createElement('div');
        var runColor = null, runText = '';
        function flushRun() {
          if (!runText) return;
          var s = document.createElement('span');
          s.style.color = runColor || 'inherit';
          s.textContent = runText;
          line.appendChild(s);
          runText = '';
        }
        row.forEach(function (cell) {
          if (cell.c !== runColor) { flushRun(); runColor = cell.c; }
          runText += cell.ch;
        });
        flushRun();
        pre.appendChild(line);
      });
    }

    var i = 0;
    function show(idx) {
      render(idx);
      title.textContent = BOOKS[idx].title;
      author.textContent = ' — ' + BOOKS[idx].author;
    }
    show(0);
    if (REDUCED) return;
    setInterval(function () { i = (i + 1) % BOOKS.length; show(i); }, 2600);
  }

  /* ---- 2. the gloss card: a real sentence, the real meaning --------- */

  // The composed harbour passage the app opens with, and the curated entry
  // for "weathered" (apps/web/src/fixtures/glosses.ts).
  var GLOSS_SENTENCE_BEFORE = 'an old man in a coat gone ';
  var GLOSS_WORD = 'weathered';
  var GLOSS_SENTENCE_AFTER = ' with years was already sorting nets.';
  var GLOSS_DEFINITION = 'Worn and marked by long exposure to sun, wind, or rain.';

  function buildGloss(mount) {
    var line = el('p', 'sb-demo-gloss__line');
    line.appendChild(document.createTextNode('“…' + GLOSS_SENTENCE_BEFORE));
    var word = el('span', 'sb-demo-gloss__word', GLOSS_WORD);
    line.appendChild(word);
    line.appendChild(document.createTextNode(GLOSS_SENTENCE_AFTER + '”'));

    var card = el('div', 'sb-demo-gloss__card');
    card.appendChild(el('span', 'sb-demo-gloss__card-word', GLOSS_WORD));
    var def = el('span', 'sb-demo-gloss__card-def');
    card.appendChild(def);
    var keep = el('span', 'sb-demo-gloss__keep', 'Keep');
    card.appendChild(keep);

    mount.appendChild(line);
    mount.appendChild(card);

    if (REDUCED) {
      def.textContent = GLOSS_DEFINITION;
      card.classList.add('sb-demo-gloss__card--open');
      word.classList.add('sb-demo-gloss__word--lit');
      return;
    }

    function cycle() {
      word.classList.add('sb-demo-gloss__word--lit');
      setTimeout(function () {
        card.classList.add('sb-demo-gloss__card--open');
        typeInto(def, GLOSS_DEFINITION, 14, function () {
          setTimeout(function () {
            keep.classList.add('sb-demo-gloss__keep--kept');
            keep.textContent = 'Kept ✓';
            setTimeout(function () {
              card.classList.remove('sb-demo-gloss__card--open');
              word.classList.remove('sb-demo-gloss__word--lit');
              setTimeout(function () {
                keep.classList.remove('sb-demo-gloss__keep--kept');
                keep.textContent = 'Keep';
                def.textContent = '';
                cycle();
              }, 1400);
            }, 1600);
          }, 1500);
        });
      }, 650);
    }
    setTimeout(cycle, 900);
  }

  /* ---- 3. the games: one real round of each ------------------------- */

  // "night" and "harbor" with answers content/challenges actually judges.
  var ROUNDS = [
    {
      label: 'Rhyme', prompt: 'night',
      offers: [
        { word: 'right', kind: 'exact' },
        { word: 'light', kind: 'exact' },
        { word: 'sight', kind: 'exact' }
      ],
      also: 'you could have said: white, flight, quite'
    },
    {
      label: 'Association', prompt: 'harbor',
      offers: [
        { word: 'haven', kind: 'exact' },
        { word: 'seaport', kind: 'exact' },
        { word: 'refuge', kind: 'exact' }
      ],
      also: 'opposite worth knowing: exposure'
    }
  ];

  function buildGames(mount) {
    var head = el('div', 'sb-demo-games__head');
    var label = el('span', 'sb-demo-games__label');
    var prompt = el('span', 'sb-demo-games__prompt');
    head.appendChild(label);
    head.appendChild(prompt);
    var chips = el('div', 'sb-demo-games__chips');
    var also = el('div', 'sb-demo-games__also');
    mount.appendChild(head);
    mount.appendChild(chips);
    mount.appendChild(also);

    function renderRound(round, animate, done) {
      label.textContent = round.label;
      prompt.textContent = round.prompt;
      chips.innerHTML = '';
      also.textContent = '';
      if (!animate) {
        round.offers.forEach(function (o) {
          chips.appendChild(el('span', 'sb-demo-games__chip sb-demo-games__chip--' + o.kind, o.word));
        });
        also.textContent = round.also;
        return;
      }
      var i = 0;
      function next() {
        if (i >= round.offers.length) {
          setTimeout(function () {
            typeInto(also, round.also, 16, function () { setTimeout(done, 2300); });
          }, 350);
          return;
        }
        var o = round.offers[i++];
        var chip = el('span', 'sb-demo-games__chip sb-demo-games__chip--typing');
        chips.appendChild(chip);
        typeInto(chip, o.word, 55, function () {
          chip.className = 'sb-demo-games__chip sb-demo-games__chip--' + o.kind;
          setTimeout(next, 420);
        });
      }
      next();
    }

    if (REDUCED) { renderRound(ROUNDS[0], false); return; }
    var r = 0;
    function loop() {
      renderRound(ROUNDS[r], true, function () {
        r = (r + 1) % ROUNDS.length;
        loop();
      });
    }
    loop();
  }

  /* ---- 4. the voice orb tile (bento) -------------------------------- */

  function buildOrb(mount) {
    var size = 88;
    var cv = document.createElement('canvas');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr; cv.height = size * dpr;
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    mount.appendChild(cv);
    var g = cv.getContext('2d');
    g.scale(dpr, dpr);

    // dots on a sphere, breathing -- the same idea as the app's orb
    var DOTS = [];
    for (var i = 0; i < 110; i++) {
      var y = 1 - (i / 109) * 2;
      var rad = Math.sqrt(1 - y * y);
      var th = i * 2.399963;
      DOTS.push({ x: Math.cos(th) * rad, y: y, z: Math.sin(th) * rad });
    }
    function draw(t) {
      g.clearRect(0, 0, size, size);
      var R = size * 0.34 * (1 + 0.05 * Math.sin(t / 900));
      var rot = t / 4200;
      DOTS.forEach(function (d) {
        var x = d.x * Math.cos(rot) - d.z * Math.sin(rot);
        var z = d.x * Math.sin(rot) + d.z * Math.cos(rot);
        var px = size / 2 + x * R, py = size / 2 + d.y * R;
        var a = 0.18 + 0.5 * (z + 1) / 2;
        g.fillStyle = 'rgba(217,106,99,' + a.toFixed(3) + ')';
        var r = 0.7 + 0.9 * (z + 1) / 2;
        g.beginPath(); g.arc(px, py, r, 0, 6.2832); g.fill();
      });
    }
    if (REDUCED) { draw(0); return; }
    (function frame(t) { draw(t || 0); requestAnimationFrame(frame); })();
  }

  /* ---- 5. small bento loops ----------------------------------------- */

  function buildSearch(mount) {
    var field = el('div', 'sb-demo-search__field');
    var q = el('span', 'sb-demo-search__q');
    field.appendChild(el('span', 'sb-demo-search__glyph', '›'));
    field.appendChild(q);
    var caret = el('span', 'sb-demo-search__caret');
    field.appendChild(caret);
    var out = el('div', 'sb-demo-search__rows');
    mount.appendChild(field);
    mount.appendChild(out);
    var HITS = ['Emma — Jane Austen', 'Persuasion — Jane Austen', 'Mansfield Park — Jane Austen'];
    function fill() {
      out.innerHTML = '';
      HITS.forEach(function (h, i) {
        var row = el('div', 'sb-demo-search__row', h);
        if (!REDUCED) row.style.animationDelay = (i * 120) + 'ms';
        out.appendChild(row);
      });
    }
    if (REDUCED) { q.textContent = 'austen'; fill(); return; }
    function loop() {
      out.innerHTML = '';
      typeInto(q, 'austen', 120, function () {
        fill();
        setTimeout(function () { q.textContent = ''; setTimeout(loop, 700); }, 3400);
      });
    }
    loop();
  }

  // Curated entries, verbatim from the app's own gloss file.
  var KEPT = [
    { w: 'sombre', d: 'Dark, dim, or serious in a way that feels heavy.' },
    { w: 'alacrity', d: 'Eager readiness or willingness to do something.' },
    { w: 'gale', d: 'A very strong wind.' }
  ];

  function buildWords(mount) {
    var list = el('div', 'sb-demo-words__list');
    mount.appendChild(list);
    function row(k) {
      var r = el('div', 'sb-demo-words__row');
      r.appendChild(el('span', 'sb-demo-words__word', k.w));
      r.appendChild(el('span', 'sb-demo-words__def', k.d));
      return r;
    }
    if (REDUCED) { KEPT.forEach(function (k) { list.appendChild(row(k)); }); return; }
    var i = 0;
    function loop() {
      if (i < KEPT.length) {
        list.appendChild(row(KEPT[i++]));
        setTimeout(loop, 1500);
      } else {
        setTimeout(function () { list.innerHTML = ''; i = 0; loop(); }, 4200);
      }
    }
    loop();
  }

  /* ---- bento reveal on scroll --------------------------------------- */

  function watchBento() {
    var tiles = document.querySelectorAll('.sb-tile');
    if (!tiles.length) return false;
    if (REDUCED || !('IntersectionObserver' in window)) {
      tiles.forEach ? tiles.forEach(function (t) { t.classList.add('sb-tile--in'); })
        : Array.prototype.forEach.call(tiles, function (t) { t.classList.add('sb-tile--in'); });
      return true;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('sb-tile--in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.25 });
    Array.prototype.forEach.call(tiles, function (t) { io.observe(t); });
    return true;
  }

  /* ---- boot ---------------------------------------------------------- */

  var MOUNTS = [
    ['demo-shelf', buildShelf],
    ['demo-gloss', buildGloss],
    ['demo-games', buildGames],
    ['demo-orb', buildOrb],
    ['demo-search', buildSearch],
    ['demo-words', buildWords]
  ];

  // The dc runtime parses the page in passes: nodes injected too early get
  // vdom-ified into the final render AND left behind, so every demo would
  // appear twice. The hero's ASCII canvas exists only after the runtime's
  // final commit (scene.js builds it through a React ref), so wait for it,
  // let the tree settle, then build each demo into a cleared mount, once.
  var tries = 0;
  var boot = setInterval(function () {
    var settled = document.querySelector('section canvas');
    if (!settled && ++tries < 100) return;
    clearInterval(boot);
    setTimeout(function () {
      MOUNTS.forEach(function (m) {
        var mount = document.getElementById(m[0]);
        if (!mount) return;
        mount.innerHTML = '';
        m[1](mount);
      });
      watchBento();
    }, 400);
  }, 120);
})();
