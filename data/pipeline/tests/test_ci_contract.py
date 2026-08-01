"""Executable contract for Superb's three CI lanes.

Run directly, or through run_all.py once that aggregate runner exists.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKFLOWS = ROOT / ".github" / "workflows"


def fail(message: str, problems: list[str]) -> None:
    problems.append(message)


def package_scripts(relative: str) -> set[str]:
    package = json.loads((ROOT / relative / "package.json").read_text(encoding="utf-8"))
    return set(package.get("scripts", {}))


def main() -> int:
    problems: list[str] = []
    core = (WORKFLOWS / "core.yml").read_text(encoding="utf-8")
    web = (WORKFLOWS / "web.yml").read_text(encoding="utf-8")
    site = (WORKFLOWS / "site.yml").read_text(encoding="utf-8")
    data = (WORKFLOWS / "data-license.yml").read_text(encoding="utf-8")
    contract_path = WORKFLOWS / "ci-contract.yml"
    contract = contract_path.read_text(encoding="utf-8") if contract_path.exists() else ""
    deep_path = WORKFLOWS / "deep-assurance.yml"
    deep = deep_path.read_text(encoding="utf-8") if deep_path.exists() else ""

    if "cargo test --workspace" in core:
        fail("core.yml still runs the exhaustive workspace test lane on every PR", problems)
    for command in [
        "--test assertions",
        "--test recommender",
        "--test coverage_gate",
        "--test pseudoword_penalty_gate",
    ]:
        if command not in deep:
            fail(f"deep-assurance.yml does not own {command}", problems)
        if command in core:
            fail(f"core.yml still invokes the slow simulator target {command}", problems)
    if re.search(r"(?m)^  workflow_dispatch:\s*$", deep) is None:
        fail("deep assurance must be manually runnable", problems)
    if re.search(r'(?m)^    - cron: "17 4 \* \* \*"\s*$', deep) is None:
        fail("deep assurance must run nightly, not weekly", problems)
    if (
        re.search(r"(?m)^  push:\s*$", deep) is None
        or re.search(r"(?m)^    branches: \[main\]\s*$", deep) is None
    ):
        fail("deep assurance must run after relevant changes land on main", problems)
    for owned in ["crates/superb-core/**", "crates/superb-sim/**", "data/**"]:
        escaped = re.escape(owned)
        if re.search(rf'(?m)^\s{{8}}"{escaped}",?\s*$', deep) is None:
            fail(f"deep assurance does not own relevant changes under {owned}", problems)

    web_scripts = package_scripts("apps/web")
    for script in ["ci:prepare", "ci:typecheck", "ci:test:unit", "ci:build", "test:e2e"]:
        if script not in web_scripts:
            fail(f"apps/web/package.json has no {script!r} script", problems)
        if f"npm run {script}" not in web:
            fail(f"web.yml does not invoke {script!r}", problems)
    if web.count("npm run build-wasm") > 0:
        fail("web.yml must prepare Wasm through one owned preparation command", problems)
    if "PLAYWRIGHT_USE_EXISTING_BUILD: \"1\"" not in web:
        fail("web.yml does not tell Playwright to test the already-built bytes", problems)

    site_scripts = package_scripts("apps/site")
    for script in ["assemble", "smoke"]:
        if script not in site_scripts:
            fail(f"apps/site/package.json has no {script!r} script", problems)
        if f"npm run {script}" not in site:
            fail(f"site.yml does not invoke {script!r}", problems)
    for marker in [
        "actions/upload-artifact@v4",
        "actions/download-artifact@v4",
        "path: apps/site/release-artifact",
        "sha256sum -c superb-pages.tar.sha256",
        "tar -xf superb-pages.tar -C ../dist",
    ]:
        if marker not in site:
            fail(f"site.yml does not preserve/promote checked bytes ({marker})", problems)
    archive = site.find("tar -cf release-artifact/superb-pages.tar -C dist .")
    restore = site.find("tar -xf release-artifact/superb-pages.tar -C dist")
    smoke = site.find("npm run smoke")
    if min(archive, restore, smoke) < 0 or not archive < restore < smoke:
        fail("site smoke must exercise a clean extraction of the archived deployable", problems)
    if "path: apps/site/dist" in site or "SHA256SUMS" in site:
        fail("site workflow still promotes a mutable dist directory or embeds checksum metadata in it", problems)

    contract_command = "python data/pipeline/tests/test_ci_contract.py"
    if contract_command not in contract:
        fail("ci-contract.yml does not execute the lane contract directly", problems)
    pull_request_trigger = re.search(r"(?m)^  pull_request:\s*$", contract)
    if pull_request_trigger is None:
        fail("ci-contract workflow must run for pull requests", problems)
    else:
        remaining = contract[pull_request_trigger.end() :]
        next_trigger = re.search(r"(?m)^  [a-z_]+:\s*$", remaining)
        pull_request_block = remaining[: next_trigger.start()] if next_trigger else remaining
        if re.search(r"(?m)^    paths(?:-ignore)?\s*:", pull_request_block):
            fail(
                "ci-contract workflow must run on every pull request without path filters "
                "so branch protection cannot wait forever",
                problems,
            )
    governed_paths = [
        ".gitignore",
        ".github/workflows/ci-contract.yml",
        ".github/workflows/core.yml",
        ".github/workflows/data-license.yml",
        ".github/workflows/deep-assurance.yml",
        ".github/workflows/site.yml",
        ".github/workflows/web.yml",
        "apps/site/package.json",
        "apps/web/package.json",
        "apps/web/playwright.config.ts",
        "data/pipeline/tests/run_all.py",
        "data/pipeline/tests/test_ci_contract.py",
        "scripts/release.py",
    ]
    for governed in governed_paths:
        if contract.count(f'"{governed}"') < 1:
            fail(f"ci-contract push path filters do not own {governed}", problems)

    aggregate = "python data/pipeline/tests/run_all.py"
    if aggregate not in data:
        fail("data-license.yml does not invoke the aggregate Python test command", problems)
    runner = ROOT / "data" / "pipeline" / "tests" / "run_all.py"
    if not runner.exists():
        fail("aggregate Python test runner is missing", problems)
    else:
        runner_text = runner.read_text(encoding="utf-8")
        for required in ["test_glosses.py", "test_excerpts.py", "test_excerpts_windowing.py", "test_ci_contract.py"]:
            if required not in runner_text:
                fail(f"aggregate Python runner does not guarantee {required}", problems)

    ignore_text = (ROOT / ".gitignore").read_text(encoding="utf-8")
    if "apps/site/release-artifact/" not in ignore_text:
        fail("root release command leaves its sealed local artifact visible to git", problems)

    release_path = ROOT / "scripts" / "release.py"
    if not release_path.exists():
        fail("root release command is missing: python scripts/release.py", problems)
    else:
        release_text = release_path.read_text(encoding="utf-8")
        for marker in [
            "data/pipeline/tests/test_ci_contract.py",
            "data/pipeline/tests/run_all.py",
            "cargo fmt --all --check",
            "cargo clippy --all-targets --all-features --locked -- -D warnings",
            "npm run ci:prepare",
            "npm run ci:test:unit",
            "npm run ci:build",
            "npm run test:e2e",
            "scripts/check-offline.mjs",
            "scripts/check-installability.mjs",
            "npm run assemble",
            "npm run smoke",
        ]:
            if marker not in release_text:
                fail(f"root release command does not own {marker!r}", problems)
        if release_text.count("tree_digest(SITE_DIST)") < 2:
            fail("root release command does not compare the assembled tree with its restored tree", problems)
        if "restored_tree_digest != source_tree_digest" not in release_text:
            fail("root release command has no fail-closed restored-tree comparison", problems)

    # The assembled deployment owns every input that can change /read/.
    for owned in ["apps/site/**", "apps/web/**", "design/**", "content/**", "crates/superb-wasm/**", "crates/superb-core/**"]:
        if site.count(f'"{owned}"') < 2:
            fail(f"site workflow path filters do not own {owned}", problems)

    if problems:
        print(f"{len(problems)} CI-contract failure(s):", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1
    print("CI contract is internally executable: fast, release, and deep lanes have explicit owners.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
