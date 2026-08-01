#!/usr/bin/env node
// Regression fixture for issue #127, proven the same way the reviewer proved
// the bug: a UTF-16 file carrying a real, disallowed URL must turn the scan
// red. This does not ship a permanently-failing fixture -- it builds one in a
// temp file, asserts the scan catches it, then deletes it, so the repository
// stays green while the regression itself stays exercised on every run.
//
// Imports only scripts/host-scan.mjs, the pure half of the scan -- unlike
// check-assembled.mjs, which launches a server and a real browser as a side
// effect of loading at all.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { decodeScannableText, findDisallowedHostUrls } from './host-scan.mjs';

const DISALLOWED_URL = 'https://exfiltrate.example.com/collect';
const ALLOWED = new Set(['allowed.example.com']);

function scanBytes(buffer) {
  return findDisallowedHostUrls(decodeScannableText(buffer), ALLOWED);
}

const dir = mkdtempSync(path.join(tmpdir(), 'host-scan-regression-'));
try {
  const source = `<!-- see ${DISALLOWED_URL} for details -->`;

  // 1. Watched red: before decodeScannableText existed, a plain latin1 read
  // of these exact bytes found nothing, because every ASCII byte in UTF-16
  // text is followed by a NUL that breaks the "https://" match. Confirmed by
  // running the *old* logic (`buffer.toString('latin1')` with no BOM check)
  // against this same fixture before writing the fix -- it returned zero
  // matches for a file that plainly contains a live URL.
  const utf16le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(source, 'utf16le')]);
  writeFileSync(path.join(dir, 'utf16le-bom.html'), utf16le);
  const staleLatin1Read = findDisallowedHostUrls(utf16le.toString('latin1'), ALLOWED);
  assert.equal(staleLatin1Read.length, 0, 'sanity check: a plain latin1 read of UTF-16 bytes should find nothing (that is the bug this fixture regresses)');

  const foundLE = scanBytes(utf16le);
  assert.equal(foundLE.length, 1, `UTF-16LE+BOM fixture: expected the disallowed URL to be caught, got ${JSON.stringify(foundLE)}`);
  assert.ok(foundLE[0].includes('exfiltrate.example.com'), `UTF-16LE+BOM fixture: wrong match ${foundLE[0]}`);

  // 2. The same fixture, big-endian, with its own BOM.
  function toUtf16BE(str) {
    const buf = Buffer.alloc(str.length * 2);
    for (let i = 0; i < str.length; i++) buf.writeUInt16BE(str.charCodeAt(i), i * 2);
    return buf;
  }
  const utf16be = Buffer.concat([Buffer.from([0xfe, 0xff]), toUtf16BE(source)]);
  writeFileSync(path.join(dir, 'utf16be-bom.html'), utf16be);
  const foundBE = scanBytes(utf16be);
  assert.equal(foundBE.length, 1, `UTF-16BE+BOM fixture: expected the disallowed URL to be caught, got ${JSON.stringify(foundBE)}`);
  assert.ok(foundBE[0].includes('exfiltrate.example.com'), `UTF-16BE+BOM fixture: wrong match ${foundBE[0]}`);

  // 3. BOM-less UTF-16LE -- the realistic case an independent reviewer proved
  // the shipped fix still missed: plenty of tools (a build step's own
  // `fs.writeFile(path, text, "utf16le")`, an editor set to "UTF-16 LE"
  // rather than "UTF-16 LE BOM") write UTF-16 with no byte-order mark at
  // all, and that reproduces the exact #127 miss while defeating a
  // BOM-only fix. Watched red against the BOM-only version of
  // decodeScannableText: `Buffer.from(source, "utf16le")` with no BOM
  // prepended returned zero findings before the null-byte-density
  // heuristic was added.
  const utf16leNoBom = Buffer.from(source, 'utf16le');
  writeFileSync(path.join(dir, 'utf16le-nobom.html'), utf16leNoBom);
  const staleNoBomRead = findDisallowedHostUrls(utf16leNoBom.toString('latin1'), ALLOWED);
  assert.equal(staleNoBomRead.length, 0, 'sanity check: a plain latin1 read of BOM-less UTF-16LE bytes should find nothing (the miss an independent reviewer proved)');
  const foundLENoBom = scanBytes(utf16leNoBom);
  assert.equal(foundLENoBom.length, 1, `BOM-less UTF-16LE fixture: expected the disallowed URL to be caught, got ${JSON.stringify(foundLENoBom)}`);
  assert.ok(foundLENoBom[0].includes('exfiltrate.example.com'), `BOM-less UTF-16LE fixture: wrong match ${foundLENoBom[0]}`);

  // 4. BOM-less UTF-16BE -- same reasoning, the other endianness.
  const utf16beNoBom = toUtf16BE(source);
  writeFileSync(path.join(dir, 'utf16be-nobom.html'), utf16beNoBom);
  const foundBENoBom = scanBytes(utf16beNoBom);
  assert.equal(foundBENoBom.length, 1, `BOM-less UTF-16BE fixture: expected the disallowed URL to be caught, got ${JSON.stringify(foundBENoBom)}`);
  assert.ok(foundBENoBom[0].includes('exfiltrate.example.com'), `BOM-less UTF-16BE fixture: wrong match ${foundBENoBom[0]}`);

  // 5. A UTF-16 file (BOM or not) naming only an *allowed* host must stay
  // green -- the fix must not turn every UTF-16 file red regardless of
  // content.
  const cleanSource = `<!-- see https://${[...ALLOWED][0]}/docs for details -->`;
  const cleanUtf16Bom = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(cleanSource, 'utf16le')]);
  assert.equal(scanBytes(cleanUtf16Bom).length, 0, 'UTF-16LE+BOM fixture naming only an allowed host should not be flagged');
  const cleanUtf16NoBom = Buffer.from(cleanSource, 'utf16le');
  assert.equal(scanBytes(cleanUtf16NoBom).length, 0, 'BOM-less UTF-16LE fixture naming only an allowed host should not be flagged');

  // 6. Ordinary text must not be misread as UTF-16 by the density heuristic.
  // A disallowed URL in plain latin1/ASCII still gets caught (the BOM/
  // heuristic branches must be additive, never a regression on the path
  // every other file in dist/ already takes), and a longer, denser sample
  // of ordinary minified-JS-shaped ASCII -- the realistic false-positive
  // risk, since it is dense and repetitive -- decodes unchanged rather than
  // being mistaken for UTF-16 (it has no null bytes at all, so neither
  // zero-density threshold is ever met).
  const foundAscii = scanBytes(Buffer.from(`see ${DISALLOWED_URL}`, 'latin1'));
  assert.equal(foundAscii.length, 1, 'plain-text fixture: existing latin1 detection must still work');
  const minifiedJs = Buffer.from('function a(b,c){return b+c}var x=1;console.log(x);'.repeat(50), 'latin1');
  const minifiedDecoded = decodeScannableText(minifiedJs);
  assert.equal(minifiedDecoded, minifiedJs.toString('latin1'), 'dense ASCII text must not be misdetected as UTF-16 by the null-byte-density heuristic');

  console.log('host-scan.regression: UTF-16LE/BE files carrying a disallowed URL are caught with or without a byte-order mark (issue #127); allowed hosts and plain/dense ASCII text are unaffected.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
