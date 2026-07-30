// Renders the landing page. Two variants only differ in which opening
// statistic leads the facts section (job 5) — everything else is shared.
//
// Type note: the reading app's tokens name Source Serif 4 (passage) and Inter
// (UI). This page has no passage and is not the app's chrome either — it is
// its own public surface (ADR-038 Decision 6), and job 6 gives it the
// mockup's own typographic feel, keeping only colour tied to the brand
// tokens. Geist (the mockup's own choice) stays as the display face here;
// if the two type systems ever need to converge across surfaces, that is a
// taste call for Kihea, not one this track settles quietly.

import { renderCountDevice, renderMechanismDevice } from './devices.mjs';

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function head(title) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@300;400;500&display=swap">
<link rel="stylesheet" href="/tokens.css">
<link rel="stylesheet" href="/styles.css">`;
}

function header() {
  return `<header class="site-header">
  <a href="/" class="wordmark">
    <span class="slash">///</span>
    <span class="name">superb</span>
  </a>
  <nav>
    <a href="#the-case">The case</a>
    <a href="#library">Library</a>
    <a href="#pricing">Pricing</a>
    <a href="#" class="accent">Sign in</a>
  </nav>
</header>`;
}

function hero() {
  // "Free while you're building the habit" is gone (ADR-010 / job 2): the
  // reading itself never becomes paid. What costs money is the part that
  // costs us money to run — and that part (voice, hosted AI) is not built
  // yet, so this line is careful to say "will be," not "is" (PR-90 finding:
  // the pricing section had this same present-tense slip; fixed here too).
  return `<section class="hero">
  <div class="shell hero-inner">
    <span class="eyebrow">Vocabulary, through reading</span>
    <h1>You probably don’t read enough.</h1>
    <p class="lede">Superb hands you something worth finishing, then keeps every word that trips you up. Tap it once — it comes back until it’s yours.</p>
    <div class="cta-row">
      <a href="#" class="btn btn--primary">Start with six minutes</a>
      <a href="#library" class="btn btn--secondary">See a passage</a>
    </div>
    <span class="fine-print">The reading is free — no account, fully usable offline. Cloud voice and hosted AI will be the paid part, once they ship; a local-model option will keep that free too.</span>
  </div>
</section>`;
}

/**
 * @param {any} figure
 * @param {{secondary?: boolean, deviceOpts?: {cols?: number}}} [options]
 */
function statCard(figure, { secondary = false, deviceOpts } = {}) {
  const device = figure.kind === 'mechanism'
    ? renderMechanismDevice(figure)
    : renderCountDevice(figure, deviceOpts);
  const citation = figure.citation
    ? `<span class="stat-citation">${escapeHtml(figure.citation)}</span>`
    : '';
  const deviceCaption = figure.deviceCaption
    ? `<span class="device-caption">${escapeHtml(figure.deviceCaption)}</span>`
    : '';
  return `<div class="stat-card${secondary ? ' stat-card--secondary' : ''}">
  <span class="stat-value">${escapeHtml(figure.displayValue ?? '')}</span>
  ${device}
  ${deviceCaption}
  <span class="stat-caption">${escapeHtml(figure.headline)}</span>
  ${citation}
</div>`;
}

function library() {
  // The library is real (614 books today) but that count changes as more
  // titles are added and is not the kind of fact worth pinning to a build —
  // the shape of the thing (public-domain books, ready now, no waitlist) is
  // what's true regardless of the exact count on any given day.
  return `<section id="library" class="pricing">
  <div class="shell" style="padding-top: clamp(56px,6vw,88px); padding-bottom: clamp(56px,6vw,88px)">
    <div class="facts-head">
      <span class="eyebrow">Library</span>
      <h2>Real books, not vocabulary drills.</h2>
    </div>
    <p class="lede" style="max-width:60ch; margin-top: var(--site-space-6)">A public-domain library, ready tonight — no waitlist, nothing to unlock. Start any of them; Superb keeps track of the words that trip you up as you go.</p>
  </div>
</section>`;
}

function facts(openingFigure) {
  const data = openingFigure; // variantA or variantB, already resolved by caller
  return `<section id="the-case" class="facts">
  <div class="shell" style="padding-top: clamp(64px,7vw,104px); padding-bottom: clamp(80px,9vw,120px); display:flex; flex-direction:column; gap: clamp(44px,5vw,76px)">
    <div class="facts-head">
      <span class="eyebrow">The case</span>
      <h2>The literacy crisis isn’t a vocabulary problem. It’s a <span class="accent">reading</span> problem.</h2>
    </div>
    <div class="stat-grid">
      ${statCard(data)}
      ${statCard(fixtureSession(), { secondary: true, deviceOpts: { cols: 6 } })}
      ${statCard(fixtureMechanism(), { secondary: true })}
    </div>
    <div class="facts-footnote">
      <span>Every number above is cited at its source, or is a fact about this product — nothing here is measured on anyone who has used it.</span>
      <a href="#pricing" class="btn btn--primary">Read something tonight</a>
    </div>
  </div>
</section>`;
}

// figures.json's session/mechanism entries are shared by both variants; the
// caller injects the variant-specific opening figure only.
let _figures = null;
export function setFigures(figures) { _figures = figures; }
function fixtureSession() { return _figures.session; }
function fixtureMechanism() { return _figures.mechanism; }

function pricing() {
  // Voice and hosted AI are not built yet (T9 job 2) — sync already carried
  // an honest "when it ships" hedge here, and PR-90's review correctly found
  // that voice and AI didn't get the same one. ADR-038 treats an unbuilt
  // feature described as present as the same defect as an uncited number, so
  // this card is written entirely in "when it ships" terms rather than flat
  // present tense, with no date implied either way.
  return `<section id="pricing" class="pricing">
  <div class="shell" style="padding-top: clamp(56px,6vw,88px); padding-bottom: clamp(56px,6vw,88px)">
    <div class="facts-head">
      <span class="eyebrow">Pricing</span>
      <h2>Reading is free. Voice and hosted AI, when they ship, are the paid part.</h2>
    </div>
    <div class="pricing-grid">
      <div class="pricing-card">
        <h3>Free, always</h3>
        <ul>
          <li>The full reading experience, offline</li>
          <li>No account required</li>
          <li>Sync across your own devices, when it ships — free and optional</li>
        </ul>
      </div>
      <div class="pricing-card">
        <h3>Paid, once it ships — because it costs us to run</h3>
        <ul>
          <li>Cloud voice — not built yet</li>
          <li>Hosted AI features — not built yet</li>
          <li>A local-model option will keep this free too, for anyone who’d rather not pay for it</li>
        </ul>
      </div>
    </div>
  </div>
</section>`;
}

function footer() {
  return `<footer class="site-footer shell">
  <span class="foot-note">© ${new Date().getUTCFullYear()} Superb.</span>
  <span class="foot-note">Built with AI tooling.</span>
</footer>`;
}

/**
 * @param {{label: string, figures: any, variantBanner?: string}} args
 */
export function renderPage({ label, figures, variantBanner = undefined }) {
  setFigures(figures);
  const opening = figures.opening;
  const banner = variantBanner
    ? `<div class="variant-banner">Variant ${escapeHtml(variantBanner)} — not a live URL. For review only; not the published page.</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head(`Superb — ${label}`)}
</head>
<body>
${header()}
${hero()}
${library()}
${facts(opening)}
${pricing()}
${footer()}
${banner}
</body>
</html>
`;
}
