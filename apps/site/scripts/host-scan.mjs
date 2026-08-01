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
// when present, and fall back to latin1 otherwise -- latin1 cannot throw on
// arbitrary binary input and simply finds nothing in bytes that aren't text,
// which is what every file on this scan's BINARY_EXTENSIONS deny-list relies
// on already.
export function decodeScannableText(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
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
