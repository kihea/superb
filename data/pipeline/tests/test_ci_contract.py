"""Executable contract for Superb's three CI lanes.

Run directly, or through run_all.py once that aggregate runner exists.
"""
from __future__ import annotations

import ast
import io
import json
import os
import re
import sys
import tokenize
from pathlib import Path

ROOT = Path(os.environ.get("SUPERB_CONTRACT_ROOT", Path(__file__).resolve().parents[3])).resolve()
WORKFLOWS = ROOT / ".github" / "workflows"


def fail(message: str, problems: list[str]) -> None:
    problems.append(message)


def package_scripts(relative: str) -> dict[str, str]:
    package = json.loads((ROOT / relative / "package.json").read_text(encoding="utf-8"))
    return package.get("scripts", {})


def executable_text(text: str) -> str:
    """Drop YAML/Python comments so dead markers cannot satisfy the contract."""
    active: list[str] = []
    for line in text.splitlines():
        if line.lstrip().startswith("#"):
            continue
        active.append(line.split(" #", 1)[0])
    return "\n".join(active)


def executable_python(text: str) -> str:
    """Remove Python comments without stripping hashes inside string literals."""
    tokens = tokenize.generate_tokens(io.StringIO(text).readline)
    return tokenize.untokenize(token for token in tokens if token.type != tokenize.COMMENT)


def release_step_commands(text: str) -> set[tuple[str, ...]]:
    """Collect literal argv from the single module-level STEPS assignment."""
    tree = ast.parse(text)
    stores = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Name) and node.id == "STEPS" and isinstance(node.ctx, ast.Store)
    ]
    assignments = [
        statement
        for statement in tree.body
        if isinstance(statement, ast.AnnAssign)
        and isinstance(statement.target, ast.Name)
        and statement.target.id == "STEPS"
        and isinstance(statement.value, ast.Tuple)
    ]
    if len(stores) != 1 or len(assignments) != 1:
        return set()

    commands: set[tuple[str, ...]] = set()
    for node in assignments[0].value.elts:
        if (
            not isinstance(node, ast.Call)
            or not isinstance(node.func, ast.Name)
            or node.func.id != "Step"
            or len(node.args) < 2
            or not isinstance(node.args[1], ast.Tuple)
        ):
            continue
        argv = node.args[1]
        if all(isinstance(item, ast.Constant) and isinstance(item.value, str) for item in argv.elts):
            commands.add(tuple(item.value for item in argv.elts))
    return commands


def release_main_runs_steps(text: str) -> bool:
    """Require main to execute each STEPS entry through run_step on its live path."""
    mains = [
        statement
        for statement in ast.parse(text).body
        if isinstance(statement, ast.FunctionDef) and statement.name == "main"
    ]
    if len(mains) != 1:
        return False
    for statement in mains[0].body:
        if not (
            isinstance(statement, ast.For)
            and isinstance(statement.target, ast.Name)
            and isinstance(statement.iter, ast.Name)
            and statement.iter.id == "STEPS"
        ):
            continue
        variable = statement.target.id
        return any(
            isinstance(child, ast.Expr)
            and isinstance(child.value, ast.Call)
            and isinstance(child.value.func, ast.Name)
            and child.value.func.id == "run_step"
            and len(child.value.args) == 1
            and isinstance(child.value.args[0], ast.Name)
            and child.value.args[0].id == variable
            for child in statement.body
        )
    return False


def release_main_calls(text: str, function_name: str) -> bool:
    """Require a named preflight to be a direct executable statement in main."""
    mains = [
        statement
        for statement in ast.parse(text).body
        if isinstance(statement, ast.FunctionDef) and statement.name == "main"
    ]
    if len(mains) != 1:
        return False
    return any(
        isinstance(statement, ast.Expr)
        and isinstance(statement.value, ast.Call)
        and isinstance(statement.value.func, ast.Name)
        and statement.value.func.id == function_name
        for statement in mains[0].body
    )


def has_condition_or_failure_masking(lines: list[str]) -> bool:
    """Required command owners must be unconditional and fail closed."""
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("continue-on-error:"):
            return True
        if not stripped.startswith("if:"):
            continue
        condition = stripped.removeprefix("if:").strip().strip("'\"").replace(" ", "").lower()
        if condition not in {"always()", "${{always()}}"}:
            return True
    return False


def workflow_runs_command(text: str, command: str) -> bool:
    """Return true when an enabled workflow job and step run the exact command."""
    lines = executable_text(text).splitlines()
    needle = f"run: {command}"
    for index, line in enumerate(lines):
        if line.strip() != needle:
            continue
        run_indent = len(line) - len(line.lstrip())
        step_start = None
        for candidate in range(index - 1, -1, -1):
            candidate_line = lines[candidate]
            candidate_indent = len(candidate_line) - len(candidate_line.lstrip())
            if candidate_line.strip().startswith("- ") and candidate_indent < run_indent:
                step_start = candidate
                break
        if step_start is None:
            continue
        step_indent = len(lines[step_start]) - len(lines[step_start].lstrip())
        if run_indent != step_indent + 2:
            # A run-looking scalar nested under `with:` or inside a multiline
            # shell program is not the step's executable run field.
            continue
        step_end = len(lines)
        for candidate in range(index + 1, len(lines)):
            candidate_line = lines[candidate]
            candidate_indent = len(candidate_line) - len(candidate_line.lstrip())
            if candidate_line.strip().startswith("- ") and candidate_indent <= step_indent:
                step_end = candidate
                break
        if has_condition_or_failure_masking(lines[step_start:step_end]):
            continue

        steps_start = None
        for candidate in range(step_start - 1, -1, -1):
            if lines[candidate].strip() == "steps:":
                steps_start = candidate
                break
        if steps_start is None:
            continue
        steps_indent = len(lines[steps_start]) - len(lines[steps_start].lstrip())
        job_start = None
        for candidate in range(steps_start - 1, -1, -1):
            candidate_line = lines[candidate]
            candidate_indent = len(candidate_line) - len(candidate_line.lstrip())
            if candidate_line.strip().endswith(":") and candidate_indent < steps_indent:
                job_start = candidate
                break
        if job_start is None:
            continue
        if has_condition_or_failure_masking(lines[job_start:steps_start]):
            continue
        return True
    return False


def workflow_runs_exact_block(text: str, commands: list[str]) -> bool:
    """Return true when an unconditional run block is exactly the requested program."""
    lines = executable_text(text).splitlines()
    for index, line in enumerate(lines):
        if line.strip() not in {"run: |", "run: >"}:
            continue
        run_indent = len(line) - len(line.lstrip())
        block: list[str] = []
        block_indexes: list[int] = []
        for candidate in range(index + 1, len(lines)):
            candidate_line = lines[candidate]
            candidate_indent = len(candidate_line) - len(candidate_line.lstrip())
            if candidate_line.strip() and candidate_indent <= run_indent:
                break
            if candidate_line.strip():
                block.append(candidate_line.strip())
                block_indexes.append(candidate)
        if block != commands:
            continue
        transformed = lines.copy()
        transformed[index] = " " * run_indent + f"run: {commands[0]}"
        for candidate in block_indexes:
            transformed[candidate] = ""
        if workflow_runs_command("\n".join(transformed), commands[0]):
            return True
    return False


def main() -> int:
    problems: list[str] = []
    core_source = (WORKFLOWS / "core.yml").read_text(encoding="utf-8")
    web_source = (WORKFLOWS / "web.yml").read_text(encoding="utf-8")
    site_source = (WORKFLOWS / "site.yml").read_text(encoding="utf-8")
    data_source = (WORKFLOWS / "data-license.yml").read_text(encoding="utf-8")
    docs_source = (WORKFLOWS / "docs.yml").read_text(encoding="utf-8")
    core = executable_text(core_source)
    web = executable_text(web_source)
    site = executable_text(site_source)
    data = executable_text(data_source)
    contract_path = WORKFLOWS / "ci-contract.yml"
    contract_source = contract_path.read_text(encoding="utf-8") if contract_path.exists() else ""
    contract = executable_text(contract_source)
    deep_path = WORKFLOWS / "deep-assurance.yml"
    deep = executable_text(deep_path.read_text(encoding="utf-8")) if deep_path.exists() else ""

    if "cargo test --workspace" in core:
        fail("core.yml still runs the exhaustive workspace test lane on every PR", problems)
    for command in [
        "run: cargo fmt --all --check",
        "run: cargo clippy --all-targets --all-features --locked -- -D warnings",
        "run: cargo test -p superb-core -p superb-wasm --all-features --locked",
        "run: cargo test -p superb-sim --lib --test oracle_boundary --locked",
    ]:
        executable = command.removeprefix("run: ")
        if not workflow_runs_command(core_source, executable):
            fail(f"core.yml does not execute the fast-lane command {executable}", problems)
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
    expected_web_scripts = {
        "ci:prepare": "npm run sync-content && npm run sync-tokens && npm run build-wasm",
        "ci:typecheck": "tsc -b",
        "ci:test:unit": "vitest run",
        "ci:build": "tsc -b && vite build",
        "test:e2e": "playwright test",
    }
    for script, expected_command in expected_web_scripts.items():
        if web_scripts.get(script) != expected_command:
            fail(f"apps/web/package.json {script!r} no longer runs {expected_command!r}", problems)
        if not workflow_runs_command(web_source, f"npm run {script}"):
            fail(f"web.yml does not invoke {script!r}", problems)
    if web.count("npm run build-wasm") > 0:
        fail("web.yml must prepare Wasm through one owned preparation command", problems)
    if "PLAYWRIGHT_USE_EXISTING_BUILD: \"1\"" not in web:
        fail("web.yml does not tell Playwright to test the already-built bytes", problems)
    expected_public_test = "npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e"
    if web_scripts.get("test") != expected_public_test:
        fail(f"apps/web/package.json 'test' no longer runs {expected_public_test!r}", problems)

    site_scripts = package_scripts("apps/site")
    expected_site_scripts = {
        "assemble": "node scripts/assemble.mjs",
        "smoke": "node scripts/check-assembled.mjs",
    }
    for script, expected_command in expected_site_scripts.items():
        if site_scripts.get(script) != expected_command:
            fail(f"apps/site/package.json {script!r} no longer runs {expected_command!r}", problems)
        if not workflow_runs_command(site_source, f"npm run {script}"):
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

    contract_command = "python -B data/pipeline/tests/test_ci_contract.py"
    mutation_command = "python -B data/pipeline/tests/test_ci_contract_mutations.py"
    verification_command = 'echo "verified=true" >> "$GITHUB_OUTPUT"'
    if not workflow_runs_exact_block(
        contract_source,
        [contract_command, mutation_command, verification_command],
    ):
        fail("ci-contract.yml does not execute both guards before recording verification", problems)
    required_check_program = [
        'test "$CONTRACT_RESULT" = success',
        'test "$CONTRACT_VERIFIED" = true',
    ]
    if not workflow_runs_exact_block(contract_source, required_check_program):
        fail("the required CI context does not fail closed on missing guard verification", problems)
    for marker in [
        "verified: ${{ steps.contract.outputs.verified }}",
        "needs: enforce",
        "CONTRACT_RESULT: ${{ needs.enforce.result }}",
        "CONTRACT_VERIFIED: ${{ needs.enforce.outputs.verified }}",
    ]:
        if marker not in contract:
            fail(f"ci-contract self-ownership handshake is missing {marker!r}", problems)
    for command in [
        "python -B data/pipeline/tests/test_check_license_claims.py",
        "python -B data/pipeline/tests/test_repository_hygiene.py",
    ]:
        if not workflow_runs_command(docs_source, command):
            fail(f"docs.yml does not execute {command}", problems)
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
        ".github/workflows/docs.yml",
        ".github/workflows/site.yml",
        ".github/workflows/web.yml",
        "apps/site/package.json",
        "apps/web/package.json",
        "apps/web/playwright.config.ts",
        "data/pipeline/tests/run_all.py",
        "data/pipeline/tests/test_ci_contract.py",
        "data/pipeline/tests/test_ci_contract_mutations.py",
        "data/pipeline/tests/test_repository_hygiene.py",
        "scripts/release.py",
    ]
    for governed in governed_paths:
        if contract.count(f'"{governed}"') < 1:
            fail(f"ci-contract push path filters do not own {governed}", problems)

    aggregate = "python data/pipeline/tests/run_all.py"
    if not workflow_runs_command(data_source, aggregate):
        fail("data-license.yml does not invoke the aggregate Python test command", problems)
    nltk_download = "python -c \"import nltk; raise SystemExit(0 if nltk.download('punkt_tab', quiet=True) else 1)\""
    if not workflow_runs_command(data_source, nltk_download):
        fail("data-license.yml does not fail closed when the punkt tokenizer download fails", problems)
    runner = ROOT / "data" / "pipeline" / "tests" / "run_all.py"
    if not runner.exists():
        fail("aggregate Python test runner is missing", problems)
    else:
        runner_text = runner.read_text(encoding="utf-8")
        for required in [
            "test_glosses.py",
            "test_excerpts.py",
            "test_excerpts_windowing.py",
            "test_ci_contract.py",
            "test_ci_contract_mutations.py",
            "test_repository_hygiene.py",
        ]:
            if required not in runner_text:
                fail(f"aggregate Python runner does not guarantee {required}", problems)

    ignore_text = (ROOT / ".gitignore").read_text(encoding="utf-8")
    if "apps/site/release-artifact/" not in ignore_text:
        fail("root release command leaves its sealed local artifact visible to git", problems)

    release_path = ROOT / "scripts" / "release.py"
    if not release_path.exists():
        fail("root release command is missing: python scripts/release.py", problems)
    else:
        release_source = release_path.read_text(encoding="utf-8")
        release_text = executable_python(release_source)
        release_commands = release_step_commands(release_source)
        if not release_main_runs_steps(release_source):
            fail("root release main does not execute the declared STEPS through run_step", problems)
        for preflight in ["ensure_wasm_bindgen", "ensure_cargo_deny"]:
            if not release_main_calls(release_source, preflight):
                fail(f"root release main does not execute required preflight {preflight}", problems)
        for command in [
            ("cargo", "fmt", "--all", "--check"),
            ("cargo", "clippy", "--all-targets", "--all-features", "--locked", "--", "-D", "warnings"),
            ("cargo", "deny", "--locked", "check", "licenses", "bans", "sources"),
        ]:
            if command not in release_commands:
                fail(f"root release command does not execute {command!r}", problems)
        for marker in [
            "data/pipeline/tests/test_ci_contract.py",
            "data/pipeline/tests/run_all.py",
            "CARGO_DENY_VERSION = \"0.20.2\"",
            "NLTK_DOWNLOAD = \"import nltk; raise SystemExit(0 if nltk.download('punkt_tab', quiet=True) else 1)\"",
            "ensure_cargo_deny(args.skip_install)",
            "cargo fmt --all --check",
            '("--with-deps", "chromium") if sys.platform.startswith("linux") else ("chromium",)',
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
