## Summary

<!-- What this pull request does, in one or two sentences. -->

## Fix

<!-- What was wrong, and what you changed to fix it. If this isn't a fix, say
     what it adds instead. -->

## Before / After

<!-- Show the change, don't only describe it: behaviour, command output, or
     screenshots, whichever makes it obvious. Two short blocks are ideal.

     Before:
     After:
-->

## Verification / Tests

<!-- What you ran and what it showed. Paste the result, not just the command.
     Run the focused checks for the files you changed. The fast CI lanes use:
       python data/pipeline/tests/run_all.py
       cargo fmt --all --check
       cargo clippy --all-targets --all-features --locked -- -D warnings
       cargo test -p superb-core -p superb-wasm --all-features --locked
       cargo test -p superb-sim --lib --test oracle_boundary --locked
       cd apps/web && npm test

     For a release candidate, run `python scripts/release.py`. The scheduled
     deep-assurance workflow owns the long simulator and report checks.

     If you added or changed a passage or a sourced excerpt, confirm it meets
     what [CONTRIBUTING.md](https://github.com/kihea/superb/blob/dev/CONTRIBUTING.md)
     asks for: a complete citation for anything quoted from an existing work.
     Don't repeat those rules here; just say you checked.

     Pull requests target `dev`, and commits are signed off with `git commit -s`. -->
