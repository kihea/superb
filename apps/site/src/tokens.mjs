// Pulls CSS custom properties from the one file the whole product's palette
// and rhythm are supposed to come from (app/design/tokens.json), rather than
// hand-copying hex values into this surface's stylesheet. If the brand
// palette moves, this file moves with it without anyone editing two places
// (the exact failure T9 job 6 is trying to avoid — a landing page with its
// own copy of the truth).
//
// Job 6: brand palette wins on colour here; layout and typographic feel stay
// the mockup's. So only `chrome.*` (the dark-first room the reading card
// floats in — the landing page has no reading card, so it is chrome start to
// finish) and the rhythm tokens (space, radius, motion) are pulled in. Type
// family is deliberately NOT pulled from tokens.json — see src/render.mjs's
// top comment for why the landing page keeps its own display face.

import { readFileSync } from 'node:fs';

export function loadTokens(tokensPath) {
  const raw = readFileSync(tokensPath, 'utf8');
  return JSON.parse(raw);
}

/** Emit `:root { --site-* }` custom properties from the dark chrome palette
 * and the shared rhythm tokens. One warm accent only, per tokens.json's own
 * comment on `chrome`: "accent is brass, and it is the only colour any
 * control, focus ring, or state uses." The cool tone (`accentCool`) is kept
 * available for edge-light gradients only, never as a flat accent — the
 * mockup's three-hue card scheme (brand/support/lilac) does not survive this
 * rule, and job 6 says the brand palette wins that argument. */
export function tokensToCss(tokens) {
  const c = tokens.chrome.dark;
  const space = tokens.space;
  const radius = tokens.radius;
  const motion = tokens.motion;

  const lines = [':root {'];
  lines.push(`  --site-ground: ${c.ground};`);
  lines.push(`  --site-ground-gradient: ${c.groundGradient};`);
  lines.push(`  --site-glow-a: ${c.glowA};`);
  lines.push(`  --site-glow-b: ${c.glowB};`);
  lines.push(`  --site-panel-fill: ${c.panelFill};`);
  lines.push(`  --site-panel-blur: ${c.panelBlur};`);
  lines.push(`  --site-metal-1: ${c.metalEdge1};`);
  lines.push(`  --site-metal-2: ${c.metalEdge2};`);
  lines.push(`  --site-metal-3: ${c.metalEdge3};`);
  lines.push(`  --site-ink: ${c.ink};`);
  lines.push(`  --site-ink-muted: ${c.inkMuted};`);
  lines.push(`  --site-accent: ${c.accent};`);
  lines.push(`  --site-accent-cool: ${c.accentCool};`);
  lines.push(`  --site-shadow: ${c.shadow};`);

  for (const [k, v] of Object.entries(space)) lines.push(`  --site-space-${k}: ${v};`);
  for (const [k, v] of Object.entries(radius)) lines.push(`  --site-radius-${k}: ${v};`);
  for (const [k, v] of Object.entries(motion)) {
    if (k.startsWith('_')) continue;
    const kebab = k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    lines.push(`  --site-${kebab}: ${v};`);
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}
