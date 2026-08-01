#!/usr/bin/env python
"""Run Superb's local release candidate gate from the repository root.

This command intentionally uses the same package-level commands as CI. The
nightly deep-assurance lane is excluded because it is scheduled separately.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web"
SITE = ROOT / "apps" / "site"
ARTIFACT = SITE / "release-artifact"
SITE_DIST = SITE / "dist"
WASM_BINDGEN_VERSION = "0.2.126"


@dataclass(frozen=True)
class Step:
    display: str
    command: tuple[str, ...]
    cwd: Path = ROOT
    env: Mapping[str, str] | None = None
    install: bool = False


STEPS: tuple[Step, ...] = (
    Step(
        "python -m pip install -r content/scripts/requirements.txt -r data/pipeline/requirements.txt",
        (
            sys.executable,
            "-m",
            "pip",
            "install",
            "-r",
            "content/scripts/requirements.txt",
            "-r",
            "data/pipeline/requirements.txt",
        ),
        install=True,
    ),
    Step(
        "python data/pipeline/tests/test_ci_contract.py",
        (sys.executable, "data/pipeline/tests/test_ci_contract.py"),
    ),
    Step(
        "python data/pipeline/tests/run_all.py",
        (sys.executable, "data/pipeline/tests/run_all.py"),
    ),
    Step("cargo fmt --all --check", ("cargo", "fmt", "--all", "--check")),
    Step(
        "cargo clippy --all-targets --all-features --locked -- -D warnings",
        ("cargo", "clippy", "--all-targets", "--all-features", "--locked", "--", "-D", "warnings"),
    ),
    Step(
        "cargo test -p superb-core -p superb-wasm --all-features --locked",
        ("cargo", "test", "-p", "superb-core", "-p", "superb-wasm", "--all-features", "--locked"),
    ),
    Step(
        "cargo test -p superb-sim --lib --test oracle_boundary --locked",
        ("cargo", "test", "-p", "superb-sim", "--lib", "--test", "oracle_boundary", "--locked"),
    ),
    Step(
        "rustup target add wasm32-unknown-unknown",
        ("rustup", "target", "add", "wasm32-unknown-unknown"),
        install=True,
    ),
    Step("npm ci", ("npm", "ci"), WEB, install=True),
    Step("npm run ci:prepare", ("npm", "run", "ci:prepare"), WEB),
    Step("npm run ci:typecheck", ("npm", "run", "ci:typecheck"), WEB),
    Step("npm run lint", ("npm", "run", "lint"), WEB),
    Step("npm run ci:test:unit", ("npm", "run", "ci:test:unit"), WEB),
    Step("npm run ci:build", ("npm", "run", "ci:build"), WEB),
    Step("npx playwright install chromium", ("npx", "playwright", "install", "chromium"), WEB, install=True),
    Step(
        "npm run test:e2e",
        ("npm", "run", "test:e2e"),
        WEB,
        {"PLAYWRIGHT_USE_EXISTING_BUILD": "1", "PLAYWRIGHT_PORT": "4437", "CI": "1"},
    ),
    Step("npm ci", ("npm", "ci"), SITE, install=True),
    Step("npx playwright install chromium", ("npx", "playwright", "install", "chromium"), SITE, install=True),
    Step("npm run assemble", ("npm", "run", "assemble"), SITE),
)


def resolved(command: Sequence[str]) -> list[str]:
    executable = shutil.which(command[0])
    if executable is None:
        raise RuntimeError(f"required executable is unavailable: {command[0]}")
    return [executable, *command[1:]]


def run_step(step: Step) -> None:
    print(f"\n=== {step.display} ===", flush=True)
    env = os.environ.copy()
    if step.env:
        env.update(step.env)
    subprocess.run(resolved(step.command), cwd=step.cwd, env=env, check=True)


def ensure_wasm_bindgen(skip_install: bool) -> None:
    executable = shutil.which("wasm-bindgen")
    if executable is not None:
        result = subprocess.run(
            [executable, "--version"],
            check=True,
            capture_output=True,
            text=True,
        )
        if result.stdout.strip().endswith(WASM_BINDGEN_VERSION):
            print(f"\n=== wasm-bindgen {WASM_BINDGEN_VERSION} already installed ===", flush=True)
            return
    if skip_install:
        raise RuntimeError(f"wasm-bindgen {WASM_BINDGEN_VERSION} is required when --skip-install is used")
    run_step(
        Step(
            f"cargo install wasm-bindgen-cli --version {WASM_BINDGEN_VERSION} --locked",
            ("cargo", "install", "wasm-bindgen-cli", "--version", WASM_BINDGEN_VERSION, "--locked"),
            install=True,
        )
    )


def run_web_pwa_checks() -> None:
    print("\n=== production offline and installability checks ===", flush=True)
    env = os.environ.copy()
    env["SUPERB_PREVIEW_ORIGIN"] = "http://localhost:4438"
    server = subprocess.Popen(
        resolved(("node", "node_modules/vite/bin/vite.js", "preview", "--port", "4438", "--strictPort")),
        cwd=WEB,
        env=env,
    )
    try:
        for script in [
            "scripts/wait-for-preview.mjs",
            "scripts/check-offline.mjs",
            "scripts/check-installability.mjs",
        ]:
            run_step(Step(f"node {script}", ("node", script), WEB, {"SUPERB_PREVIEW_ORIGIN": env["SUPERB_PREVIEW_ORIGIN"]}))
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


def tree_digest(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*"), key=lambda candidate: candidate.as_posix()):
        if path.is_symlink():
            raise RuntimeError(f"release artifact may not contain symlinks: {path.relative_to(root)}")
        if not path.is_file():
            continue
        relative = path.relative_to(root).as_posix().encode("utf-8")
        content = path.read_bytes()
        digest.update(len(relative).to_bytes(8, "big"))
        digest.update(relative)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return digest.hexdigest()


def seal_and_restore_site() -> str:
    print("\n=== seal and restore the assembled site ===", flush=True)
    shutil.rmtree(ARTIFACT, ignore_errors=True)
    ARTIFACT.mkdir(parents=True)
    archive = ARTIFACT / "superb-pages.tar"
    checksum = ARTIFACT / "superb-pages.tar.sha256"

    source_tree_digest = tree_digest(SITE_DIST)
    subprocess.run(
        resolved(("tar", "-cf", "release-artifact/superb-pages.tar", "-C", "dist", ".")),
        cwd=SITE,
        check=True,
    )
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    checksum.write_text(f"{digest}  superb-pages.tar\n", encoding="ascii", newline="\n")

    shutil.rmtree(SITE_DIST)
    SITE_DIST.mkdir()
    subprocess.run(
        resolved(("tar", "-xf", "release-artifact/superb-pages.tar", "-C", "dist")),
        cwd=SITE,
        check=True,
    )
    restored_tree_digest = tree_digest(SITE_DIST)
    if restored_tree_digest != source_tree_digest:
        raise RuntimeError("sealed site archive did not restore the accepted site tree")
    return digest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true", help="print the release steps without running them")
    parser.add_argument(
        "--skip-install",
        action="store_true",
        help="skip dependency/tool installation steps; fail if the pinned wasm-bindgen is absent",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.list:
        pwa_listed = False
        for step in STEPS:
            if step.cwd == SITE and not pwa_listed:
                print("node scripts/wait-for-preview.mjs")
                print("node scripts/check-offline.mjs")
                print("node scripts/check-installability.mjs")
                pwa_listed = True
            print(step.display)
        print("seal and restore the assembled site")
        print("npm run smoke")
        return 0

    ensure_wasm_bindgen(args.skip_install)
    pwa_checked = False
    for step in STEPS:
        if step.cwd == SITE and not pwa_checked:
            run_web_pwa_checks()
            pwa_checked = True
        if args.skip_install and step.install:
            continue
        run_step(step)
    digest = seal_and_restore_site()
    run_step(Step("npm run smoke", ("npm", "run", "smoke"), SITE))
    print(f"\nRelease candidate gate passed; sealed site SHA-256: {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
