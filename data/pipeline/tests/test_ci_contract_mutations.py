"""Mutation tests for the executable CI/release contract guard."""
from __future__ import annotations

import json
import os
import runpy
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONTRACT = ROOT / "data" / "pipeline" / "tests" / "test_ci_contract.py"
GOVERNED_FILES = [
    ".gitignore",
    ".github/workflows/core.yml",
    ".github/workflows/web.yml",
    ".github/workflows/site.yml",
    ".github/workflows/data-license.yml",
    ".github/workflows/deep-assurance.yml",
    ".github/workflows/ci-contract.yml",
    ".github/workflows/docs.yml",
    "apps/web/package.json",
    "apps/site/package.json",
    "scripts/release.py",
    "data/pipeline/tests/run_all.py",
]


def copy_contract_fixture(destination: Path) -> None:
    for relative in GOVERNED_FILES:
        source = ROOT / relative
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def run_contract(fixture: Path) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["SUPERB_CONTRACT_ROOT"] = str(fixture)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return subprocess.run(
        [sys.executable, "-B", str(CONTRACT)],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )


def main() -> int:
    survivors: list[str] = []
    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        baseline = run_contract(fixture)
        if baseline.returncode != 0:
            print("ci-contract mutation fixture does not pass before mutation", file=sys.stderr)
            print(baseline.stdout + baseline.stderr, file=sys.stderr)
            return 1

        web_package_path = fixture / "apps" / "web" / "package.json"
        web_package = json.loads(web_package_path.read_text(encoding="utf-8"))
        web_package["scripts"]["ci:build"] = "echo no-op"
        web_package_path.write_text(json.dumps(web_package, indent=2) + "\n", encoding="utf-8")
        if run_contract(fixture).returncode == 0:
            survivors.append("web ci:build replaced by a no-op while the script name survived")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        core_path = fixture / ".github" / "workflows" / "core.yml"
        core = core_path.read_text(encoding="utf-8")
        expected = "run: cargo test -p superb-core -p superb-wasm --all-features --locked"
        if expected not in core:
            print(f"fixture marker missing: {expected}", file=sys.stderr)
            return 1
        core_path.write_text(core.replace(expected, f"run: echo no-op # {expected}"), encoding="utf-8")
        if run_contract(fixture).returncode == 0:
            survivors.append("core test command moved into an inline comment behind a no-op")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        web_path = fixture / ".github" / "workflows" / "web.yml"
        web = web_path.read_text(encoding="utf-8")
        expected = "        run: npm run ci:build"
        if expected not in web:
            print(f"fixture marker missing: {expected.strip()}", file=sys.stderr)
            return 1
        web_path.write_text(
            web.replace(
                expected,
                "        run: echo no-op\n      - name: npm run ci:build marker only\n        run: echo no-op",
            ),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("web ci:build command moved into a step name behind a no-op")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        web_path = fixture / ".github" / "workflows" / "web.yml"
        web = web_path.read_text(encoding="utf-8")
        expected = "      - name: Build\n        run: npm run ci:build"
        if expected not in web:
            print("fixture Build step is missing", file=sys.stderr)
            return 1
        web_path.write_text(
            web.replace(expected, "      - name: Build\n        if: ${{ false }}\n        run: npm run ci:build"),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("web ci:build survives only in a statically disabled step")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        web_path = fixture / ".github" / "workflows" / "web.yml"
        web = web_path.read_text(encoding="utf-8")
        expected = "    runs-on: ubuntu-latest\n    steps:"
        if expected not in web:
            print("fixture web job is missing", file=sys.stderr)
            return 1
        web_path.write_text(
            web.replace(expected, "    runs-on: ubuntu-latest\n    if: false\n    steps:"),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("required web commands survive only in a statically disabled job")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        core_path = fixture / ".github" / "workflows" / "core.yml"
        core = core_path.read_text(encoding="utf-8")
        expected = "    runs-on: ubuntu-latest\n    steps:"
        if expected not in core:
            print("fixture core job is missing", file=sys.stderr)
            return 1
        core_path.write_text(
            core.replace(expected, "    runs-on: ubuntu-latest\n    if: github.event_name == 'schedule'\n    steps:"),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("core commands survive only in a job impossible on its advertised triggers")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        core_path = fixture / ".github" / "workflows" / "core.yml"
        core = core_path.read_text(encoding="utf-8")
        expected = "      - name: Core and Wasm tests\n        run: cargo test -p superb-core -p superb-wasm --all-features --locked"
        if expected not in core:
            print("fixture core test step is missing", file=sys.stderr)
            return 1
        core_path.write_text(
            core.replace(
                expected,
                "      - name: Core and Wasm tests\n        if: github.event_name == 'schedule'\n"
                "        run: cargo test -p superb-core -p superb-wasm --all-features --locked",
            ),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("core test command survives only in a step impossible on its advertised triggers")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        release_path = fixture / "scripts" / "release.py"
        release = release_path.read_text(encoding="utf-8")
        expected = '("cargo", "clippy", "--all-targets", "--all-features", "--locked", "--", "-D", "warnings"),'
        if expected not in release:
            print(f"fixture marker missing: {expected}", file=sys.stderr)
            return 1
        release_path.write_text(
            release.replace(expected, f'("python", "-c", "pass"),  # {expected}'),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("release clippy command moved into a comment behind a no-op")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        release_path = fixture / "scripts" / "release.py"
        release = release_path.read_text(encoding="utf-8")
        expected = '("cargo", "clippy", "--all-targets", "--all-features", "--locked", "--", "-D", "warnings"),'
        release_path.write_text(
            release.replace(expected, f'("python", "-c", "pass"),# {expected}'),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("release clippy command survives only in a no-space Python comment")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        release_path = fixture / "scripts" / "release.py"
        release = release_path.read_text(encoding="utf-8")
        expected = '("cargo", "clippy", "--all-targets", "--all-features", "--locked", "--", "-D", "warnings"),'
        release_path.write_text(
            release.replace(expected, '("python", "-c", "pass"),')
            + f'\nDEAD_CLIPPY_MARKER = """{expected}"""\n',
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("release clippy command survives only in a dead Python string")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        release_path = fixture / "scripts" / "release.py"
        release = release_path.read_text(encoding="utf-8")
        expected = '("cargo", "clippy", "--all-targets", "--all-features", "--locked", "--", "-D", "warnings"),'
        release_path.write_text(
            release.replace(expected, '("python", "-c", "pass"),')
            + f'\nif False:\n    Step("dead clippy command", {expected.removesuffix(",")})\n',
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("release clippy command survives only in an unreachable Step")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        release_path = fixture / "scripts" / "release.py"
        release = release_path.read_text(encoding="utf-8")
        expected = "        run_step(step)"
        if expected not in release:
            print("fixture release execution loop is missing", file=sys.stderr)
            return 1
        release_path.write_text(
            release.replace(expected, "        if False:\n            run_step(step)"),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("release STEPS loop keeps run_step only on an unreachable branch")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        release_path = fixture / "scripts" / "release.py"
        release = release_path.read_text(encoding="utf-8")
        expected = "    ensure_cargo_deny(args.skip_install)"
        if expected not in release:
            print("fixture cargo-deny preflight is missing", file=sys.stderr)
            return 1
        release_path.write_text(
            release.replace(expected, '    "ensure_cargo_deny(args.skip_install)"'),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("cargo-deny preflight survives only as a dead Python string")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        core_path = fixture / ".github" / "workflows" / "core.yml"
        core = core_path.read_text(encoding="utf-8")
        expected = "      - name: Clippy\n        run: cargo clippy --all-targets --all-features --locked -- -D warnings"
        if expected not in core:
            print("fixture clippy step is missing", file=sys.stderr)
            return 1
        core_path.write_text(
            core.replace(
                expected,
                "      - name: Clippy\n        continue-on-error: true\n"
                "        run: cargo clippy --all-targets --all-features --locked -- -D warnings",
            ),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("required clippy owner masks command failures at step level")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        core_path = fixture / ".github" / "workflows" / "core.yml"
        core = core_path.read_text(encoding="utf-8")
        expected = "    runs-on: ubuntu-latest\n    steps:"
        if expected not in core:
            print("fixture core job is missing", file=sys.stderr)
            return 1
        core_path.write_text(
            core.replace(
                expected,
                "    runs-on: ubuntu-latest\n    continue-on-error: true\n    steps:",
                1,
            ),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("required core owners mask command failures at job level")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        web_path = fixture / ".github" / "workflows" / "web.yml"
        web = web_path.read_text(encoding="utf-8")
        expected = "        run: npm run ci:build"
        web_path.write_text(
            web.replace(expected, "        run: |\n          printf '%s\\n' 'run: npm run ci:build'"),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("web ci:build survives only as a shell-string marker")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        web_path = fixture / ".github" / "workflows" / "web.yml"
        web = web_path.read_text(encoding="utf-8")
        expected = "        run: npm run ci:build"
        web_path.write_text(
            web.replace(expected, "        run: |\n          exit 0\n          run: npm run ci:build"),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("web ci:build survives only after an early successful shell exit")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        web_path = fixture / ".github" / "workflows" / "web.yml"
        web = web_path.read_text(encoding="utf-8")
        expected = "      - name: Build\n        run: npm run ci:build"
        if expected not in web:
            print("fixture web Build step is missing", file=sys.stderr)
            return 1
        web_path.write_text(
            web.replace(
                expected,
                "      - uses: actions/checkout@v4\n        with:\n          run: npm run ci:build",
            ),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("web ci:build survives only as an action input")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        docs_path = fixture / ".github" / "workflows" / "docs.yml"
        docs = docs_path.read_text(encoding="utf-8")
        expected = "        run: python -B data/pipeline/tests/test_repository_hygiene.py"
        docs_path.write_text(
            docs.replace(
                expected,
                "        run: |\n          exit 0\n          run: python -B data/pipeline/tests/test_repository_hygiene.py",
            ),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("docs hygiene command survives only after an early successful shell exit")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        contract_path = fixture / ".github" / "workflows" / "ci-contract.yml"
        contract = contract_path.read_text(encoding="utf-8")
        expected = "          python -B data/pipeline/tests/test_ci_contract_mutations.py\n"
        contract_path.write_text(contract.replace(expected, ""), encoding="utf-8")
        if run_contract(fixture).returncode == 0:
            survivors.append("required CI workflow no longer invokes the mutation harness")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        contract_path = fixture / ".github" / "workflows" / "ci-contract.yml"
        contract = contract_path.read_text(encoding="utf-8")
        expected = "        run: |\n          python -B data/pipeline/tests/test_ci_contract.py"
        if expected not in contract:
            print("fixture CI-contract run block is missing", file=sys.stderr)
            return 1
        contract_path.write_text(
            contract.replace(expected, "        run: |\n          exit 0\n          python -B data/pipeline/tests/test_ci_contract.py"),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("CI guards survive only after an early successful shell exit")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        contract_path = fixture / ".github" / "workflows" / "ci-contract.yml"
        contract = contract_path.read_text(encoding="utf-8")
        expected = (
            "      - id: contract\n"
            "        name: Prove every release command has an owner\n"
            "        run: |\n"
            "          python -B data/pipeline/tests/test_ci_contract.py\n"
            "          python -B data/pipeline/tests/test_ci_contract_mutations.py\n"
            "          echo \"verified=true\" >> \"$GITHUB_OUTPUT\"\n"
        )
        if expected not in contract:
            print("fixture CI-contract enforcement step is missing", file=sys.stderr)
            return 1
        contract_path.write_text(contract.replace(expected, ""), encoding="utf-8")
        if run_contract(fixture).returncode == 0:
            survivors.append("required CI context can delete its contract-enforcement step")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        docs_path = fixture / ".github" / "workflows" / "docs.yml"
        docs = docs_path.read_text(encoding="utf-8")
        expected = "\n      - name: Validate public repository hygiene\n        run: python -B data/pipeline/tests/test_repository_hygiene.py\n"
        docs_path.write_text(docs.replace(expected, "\n"), encoding="utf-8")
        if run_contract(fixture).returncode == 0:
            survivors.append("docs workflow no longer invokes the repository-hygiene gate")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        web_package_path = fixture / "apps" / "web" / "package.json"
        web_package = json.loads(web_package_path.read_text(encoding="utf-8"))
        web_package["scripts"]["test"] = "echo no-op"
        web_package_path.write_text(json.dumps(web_package, indent=2) + "\n", encoding="utf-8")
        if run_contract(fixture).returncode == 0:
            survivors.append("public npm test command replaced by a no-op")

    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory)
        copy_contract_fixture(fixture)
        release_path = fixture / "scripts" / "release.py"
        release = release_path.read_text(encoding="utf-8")
        release_path.write_text(
            release.replace('CARGO_DENY_VERSION = "0.20.2"', 'CARGO_DENY_VERSION = "0.19.0"'),
            encoding="utf-8",
        )
        if run_contract(fixture).returncode == 0:
            survivors.append("release cargo-deny pin drifted from the governed version")

    with tempfile.TemporaryDirectory() as directory:
        fake_module = Path(directory) / "nltk.py"
        fake_module.write_text("def download(*args, **kwargs):\n    return False\n", encoding="utf-8")
        env = os.environ.copy()
        env["PYTHONPATH"] = directory
        download = subprocess.run(
            [
                sys.executable,
                "-c",
                "import nltk; raise SystemExit(0 if nltk.download('punkt_tab', quiet=True) else 1)",
            ],
            cwd=ROOT,
            env=env,
            check=False,
        )
        if download.returncode == 0:
            survivors.append("punkt bootstrap reports success when nltk.download returns false")

    release_namespace = runpy.run_path(str(ROOT / "scripts" / "release.py"))
    release_shutil = release_namespace["shutil"]
    release_subprocess = release_namespace["subprocess"]
    original_which = release_shutil.which
    original_run = release_subprocess.run
    try:
        release_shutil.which = lambda _: "cargo-deny"
        release_subprocess.run = lambda *args, **kwargs: subprocess.CompletedProcess(
            args=args,
            returncode=0,
            stdout="cargo-deny 0.20.20\n",
        )
        try:
            release_namespace["ensure_cargo_deny"](skip_install=True)
        except RuntimeError:
            pass
        else:
            survivors.append("cargo-deny prefix version is accepted as the exact pin")
    finally:
        release_shutil.which = original_which
        release_subprocess.run = original_run

    try:
        release_shutil.which = lambda _: "wasm-bindgen"
        release_subprocess.run = lambda *args, **kwargs: subprocess.CompletedProcess(
            args=args,
            returncode=0,
            stdout="wasm-bindgen 10.2.126\n",
        )
        try:
            release_namespace["ensure_wasm_bindgen"](skip_install=True)
        except RuntimeError:
            pass
        else:
            survivors.append("wasm-bindgen prefix version is accepted as the exact pin")
    finally:
        release_shutil.which = original_which
        release_subprocess.run = original_run

    if survivors:
        print(f"{len(survivors)} CI-contract mutation(s) survived:", file=sys.stderr)
        for survivor in survivors:
            print(f"  - {survivor}", file=sys.stderr)
        return 1
    print("CI-contract mutation gate rejects no-ops, dead markers, and statically disabled commands.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
