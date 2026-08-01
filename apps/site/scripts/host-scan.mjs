// The pure, side-effect-free half of the static host scan (issues #126,
// #127, #128): given a file's raw bytes, find every URL-shaped substring and
// report which hostnames aren't on an allow-list. Kept apart from
// check-assembled.mjs -- which also launches a server and a real browser as
// a side effect of running at all -- so a regression test can import just
// this and prove it catches a real case, without paying for or triggering
// the browser-driven smoke check.

// Issue #127: a UTF-16 file interleaves a zero byte with every ASCII
// character ("h\0t\0t\0p\0s\0:\0..."), so "https://" never matches a latin1
// decode of the same bytes -- confirmed by writing a UTF-16 fixture with a
// real disallowed URL in a temp copy and watching the scan miss it (see
// scripts/host-scan.regression.mjs). A byte-order mark is the standard,
// unambiguous signal for which UTF-16 form a text file uses; decode with it
// when present.
//
// A leading BOM is not the realistic case, though -- plenty of tools (a
// build step's own `fs.writeFile` with an explicit "utf16le" encoding,
// Windows editors set to "UTF-16 LE" rather than "UTF-16 LE BOM") write
// BOM-less UTF-16 by default, and that variant reproduces the exact miss
// #127 was filed for while still passing every check that only looks for a
// BOM. Caught in review, not by this scan itself: `Buffer.from(text,
// 'utf16le')` with no BOM prepended returned zero findings against the
// pre-fix code (see the regression fixture's own "no BOM" cases).
//
// Without a BOM there is no certain signal, only a heuristic: in UTF-16
// encoding a Basic Latin character's *other* byte is always 0x00 (the
// high byte in LE, the low byte in BE), so ordinary ASCII/Latin-1 text
// encoded as UTF-16 has zeroes at every other byte position -- something a
// real latin1/UTF-8 text file essentially never does. Sampling the zero
// rate at even and odd positions separately tells LE from BE from neither.
// This is a heuristic, not a certainty -- it can miss UTF-16 text that
// isn't Basic Latin (each code unit's *both* bytes are non-zero for most
// non-Latin scripts, so the same zero-density signal isn't there), and a
// pathological latin1 file that happens to alternate with real NUL bytes
// could false-positive. Documented rather than silently accepted: this
// scan is a lint on top of the CSP boundary (see check-assembled.mjs's own
// comment), not the last word on arbitrary bytes, and a non-Latin UTF-16
// payload is the one shape of this same bug that remains open after this
// fix -- filed as a known residual gap, not claimed to be closed.
function detectBomlessUtf16(buffer) {
  // Too short to sample meaningfully, and too short to matter -- a
  // same-origin script needs more than a couple of bytes to be a URL.
  if (buffer.length < 16) return null;
  const sampleSize = Math.min(buffer.length, 8192) & ~1; // even, so pairs line up
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < sampleSize; i += 2) {
    if (buffer[i] === 0x00) evenZero++;
    if (buffer[i + 1] === 0x00) oddZero++;
  }
  const pairs = sampleSize / 2;
  const evenZeroRatio = evenZero / pairs;
  const oddZeroRatio = oddZero / pairs;
  const ZERO_HEAVY = 0.3; // the reviewer's own threshold, proven against a real fixture
  const ZERO_LIGHT = 0.1; // the *other* position must look like real text, not also binary noise
  if (oddZeroRatio > ZERO_HEAVY && evenZeroRatio < ZERO_LIGHT) return 'utf-16le';
  if (evenZeroRatio > ZERO_HEAVY && oddZeroRatio < ZERO_LIGHT) return 'utf-16be';
  return null;
}

export function decodeScannableText(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
  const bomless = detectBomlessUtf16(buffer);
  if (bomless) return new TextDecoder(bomless).decode(buffer);
  // latin1 cannot throw on arbitrary binary input and simply finds nothing
  // in bytes that aren't text, which is what every file on this scan's
  // BINARY_EXTENSIONS deny-list relies on already.
  return buffer.toString('latin1');
}

// ';' ends the match: it is a legal WHATWG hostname code point, so the CSP
// value `https://unpkg.com;` in dist/_headers otherwise parses to the
// hostname "unpkg.com;" and misses an allow-list entry for "unpkg.com".
const URL_PATTERN = /https?:[\\/]*[^\s"'<>`);]+/gi;

// Returns every URL-shaped substring in `text` whose hostname is not in
// `allowedHosts`. A URL-shaped substring in a comment or a minified string is
// not necessarily a URL -- `new URL` throws on those, and an uncaught throw
// here would take the whole gate down with a raw stack trace instead of a
// named failure, which fails closed but is a gate somebody eventually
// loosens to stop it crashing. Skip what does not parse.
export function findDisallowedHostUrls(text, allowedHosts) {
  const found = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    let hostname;
    try {
      hostname = new URL(match[0]).hostname;
    } catch {
      continue;
    }
    if (!allowedHosts.has(hostname)) found.push(match[0]);
  }
  return found;
}
