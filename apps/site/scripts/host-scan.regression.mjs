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
  // 1. Watched red: before decodeScannableText existed, a plain latin1 read
  // of these exact bytes found nothing, because every ASCII byte in UTF-16
  // text is followed by a NUL that breaks the "https://" match. Confirmed by
  // running the *old* logic (`buffer.toString('latin1')` with no BOM check)
  // against this same fixture before writing the fix -- it returned zero
  // matches for a file that plainly contains a live URL.
  const source = `<!-- see ${DISALLOWED_URL} for details -->`;
  const utf16le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(source, 'utf16le')]);
  writeFileSync(path.join(dir, 'utf16le.html'), utf16le);
  const staleLatin1Read = findDisallowedHostUrls(utf16le.toString('latin1'), ALLOWED);
  assert.equal(staleLatin1Read.length, 0, 'sanity check: a plain latin1 read of UTF-16 bytes should find nothing (that is the bug this fixture regresses)');

  const foundLE = scanBytes(utf16le);
  assert.equal(foundLE.length, 1, `UTF-16LE fixture: expected the disallowed URL to be caught, got ${JSON.stringify(foundLE)}`);
  assert.ok(foundLE[0].includes('exfiltrate.example.com'), `UTF-16LE fixture: wrong match ${foundLE[0]}`);

  // 2. The same fixture, big-endian, with its own BOM.
  const utf16beBody = Buffer.alloc(source.length * 2);
  for (let i = 0; i < source.length; i++) utf16beBody.writeUInt16BE(source.charCodeAt(i), i * 2);
  const utf16be = Buffer.concat([Buffer.from([0xfe, 0xff]), utf16beBody]);
  writeFileSync(path.join(dir, 'utf16be.html'), utf16be);
  const foundBE = scanBytes(utf16be);
  assert.equal(foundBE.length, 1, `UTF-16BE fixture: expected the disallowed URL to be caught, got ${JSON.stringify(foundBE)}`);
  assert.ok(foundBE[0].includes('exfiltrate.example.com'), `UTF-16BE fixture: wrong match ${foundBE[0]}`);

  // 3. A UTF-16 file naming only an *allowed* host must stay green -- the fix
  // must not turn every UTF-16 file red regardless of content.
  const cleanSource = `<!-- see https://${[...ALLOWED][0]}/docs for details -->`;
  const cleanUtf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(cleanSource, 'utf16le')]);
  const foundClean = scanBytes(cleanUtf16);
  assert.equal(foundClean.length, 0, `UTF-16 fixture naming only an allowed host should not be flagged, got ${JSON.stringify(foundClean)}`);

  // 4. An ordinary latin1/UTF-8-as-latin1 file with a disallowed URL still
  // gets caught -- the BOM branch must be additive, not a regression on the
  // path every other file in dist/ already takes.
  const foundAscii = scanBytes(Buffer.from(`see ${DISALLOWED_URL}`, 'latin1'));
  assert.equal(foundAscii.length, 1, 'plain-text fixture: existing latin1 detection must still work');

  console.log('host-scan.regression: UTF-16LE and UTF-16BE files carrying a disallowed URL are both caught (issue #127); allowed hosts and plain text are unaffected.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
