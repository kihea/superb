"""Contributor-facing repository hygiene regression checks."""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[3]
REFERENCE_DEFINITION = re.compile(r"(?m)^ {0,3}\[([^\]\n]+)\]:\s*(<[^>\n]*>|\S+)")


def is_escaped(text: str, index: int) -> bool:
    backslashes = 0
    cursor = index - 1
    while cursor >= 0 and text[cursor] == "\\":
        backslashes += 1
        cursor -= 1
    return backslashes % 2 == 1


def conceal_markdown_code(text: str) -> str:
    """Blank code and comments while preserving line and character positions."""

    def conceal(value: str) -> str:
        return "".join("\n" if character == "\n" else "\r" if character == "\r" else " " for character in value)

    visible_lines: list[str] = []
    fence_character: str | None = None
    fence_length = 0
    fence_indent = 3
    for line in text.splitlines(keepends=True):
        if fence_character is not None:
            closing = rf"^ {{0,{fence_indent}}}{re.escape(fence_character)}{{{fence_length},}}[ \t]*(?:\r?\n)?$"
            visible_lines.append(conceal(line))
            if re.match(closing, line):
                fence_character = None
                fence_length = 0
                fence_indent = 3
            continue

        opening = re.match(
            r"^( {0,3}(?:(?:[-+*]|\d+[.)])[ \t]+)?)(`{3,}|~{3,})(.*?)(?:\r?\n)?$",
            line,
        )
        if opening and not (opening.group(2).startswith("`") and "`" in opening.group(3)):
            fence_character = opening.group(2)[0]
            fence_length = len(opening.group(2))
            fence_indent = max(3, len(opening.group(1).expandtabs(4)) + 3)
            visible_lines.append(conceal(line))
            continue
        if line.startswith(("    ", "\t")):
            visible_lines.append(conceal(line))
            continue
        visible_lines.append(line)

    visible = "".join(visible_lines)
    visible = re.sub(r"<!--.*?(?:-->|$)", lambda match: conceal(match.group(0)), visible, flags=re.DOTALL)

    characters = list(visible)
    cursor = 0
    while cursor < len(visible):
        if visible[cursor] != "`" or is_escaped(visible, cursor):
            cursor += 1
            continue
        end_of_opener = cursor
        while end_of_opener < len(visible) and visible[end_of_opener] == "`":
            end_of_opener += 1
        delimiter = visible[cursor:end_of_opener]
        closing = visible.find(delimiter, end_of_opener)
        while closing >= 0 and (
            is_escaped(visible, closing)
            or
            (closing > 0 and visible[closing - 1] == "`")
            or (closing + len(delimiter) < len(visible) and visible[closing + len(delimiter)] == "`")
        ):
            closing = visible.find(delimiter, closing + len(delimiter))
        if closing < 0:
            cursor = end_of_opener
            continue
        for index in range(cursor, closing + len(delimiter)):
            if characters[index] not in {"\n", "\r"}:
                characters[index] = " "
        cursor = closing + len(delimiter)
    return "".join(characters)


def inline_destinations(text: str) -> list[str | None]:
    """Return inline destinations; None marks link syntax with no closing parenthesis."""
    destinations: list[str | None] = []
    cursor = 0
    while True:
        marker = text.find("](", cursor)
        if marker < 0:
            break
        line_start = text.rfind("\n", 0, marker) + 1
        label_start = marker - 1
        while label_start >= line_start and text[label_start] != "[":
            label_start -= 1
        if label_start < line_start or is_escaped(text, label_start):
            cursor = marker + 2
            continue
        start = marker + 2
        depth = 1
        escaped = False
        for index in range(start, len(text)):
            character = text[index]
            if character in "\r\n" and depth:
                destinations.append(None)
                cursor = index + 1
                break
            if escaped:
                escaped = False
                continue
            if character == "\\":
                escaped = True
                continue
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
                if depth == 0:
                    destinations.append(text[start:index])
                    cursor = index + 1
                    break
        else:
            destinations.append(None)
            cursor = len(text)
    return destinations


def reference_uses(text: str) -> list[tuple[str, str]]:
    """Return (label, normalized reference id) for full and collapsed references."""
    uses: list[tuple[str, str]] = []
    for match in re.finditer(r"\[([^\]\n]+)\]\[([^\]\n]*)\]", text):
        if is_escaped(text, match.start()):
            continue
        label = match.group(1)
        identifier = match.group(2) or label
        normalized = " ".join(identifier.split()).casefold()
        uses.append((label, normalized))
    return uses


def local_link_problems(root: Path, markdown_files: list[Path]) -> list[str]:
    problems: list[str] = []
    for document in markdown_files:
        text = conceal_markdown_code(document.read_text(encoding="utf-8"))
        definitions = {
            " ".join(match.group(1).split()).casefold(): match.group(2)
            for match in REFERENCE_DEFINITION.finditer(text)
        }
        for label, identifier in reference_uses(text):
            if identifier not in definitions:
                problems.append(
                    f"{document.relative_to(root)} uses undefined reference link {label!r}"
                )
        destinations = inline_destinations(text) + list(definitions.values())
        for raw in destinations:
            if raw is None:
                problems.append(f"{document.relative_to(root)} contains an unterminated inline link destination")
                continue
            destination = raw.strip()
            if destination.startswith("<") and ">" in destination:
                destination = destination[1 : destination.index(">")]
            else:
                destination = destination.split(maxsplit=1)[0]
            split = urlsplit(destination)
            if split.scheme or destination.startswith(("#", "//")):
                continue
            decoded = unquote(split.path)
            if not decoded:
                continue
            target = (
                root / decoded.lstrip("/")
                if decoded.startswith("/")
                else document.parent / decoded
            )
            if not target.exists():
                problems.append(f"{document.relative_to(root)} links to missing local path {decoded!r}")
    return problems


def tracked_markdown_files(root: Path) -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "*.md"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    return [root / relative for relative in result.stdout.splitlines() if relative]


def main() -> int:
    problems: list[str] = []
    issue_form = (ROOT / ".github" / "ISSUE_TEMPLATE" / "bug_report.yml").read_text(encoding="utf-8")

    for option in [
        "Web reading app",
        "Landing site",
        "Rust engine",
        "Content/data tooling",
        "Something else / not sure",
    ]:
        if f"        - {option}\n" not in issue_form:
            problems.append(f"bug report form is missing the current surface {option!r}")
    for absent_surface in ["Android app", "iOS app"]:
        if f"        - {absent_surface}\n" in issue_form:
            problems.append(f"bug report form advertises absent surface {absent_surface!r}")

    issue_config = (ROOT / ".github" / "ISSUE_TEMPLATE" / "config.yml").read_text(encoding="utf-8")
    excerpt_anchor = (
        "https://github.com/kihea/superb/blob/main/"
        "CONTRIBUTING.md#sourced-excerpts-from-existing-literature"
    )
    if excerpt_anchor not in issue_config:
        problems.append("issue-form passage link does not target the sourced-excerpt guidance")

    corpus_hidden = "data/pipeline/tests/.corpus_precision_hidden.json"
    ignored = subprocess.run(
        ["git", "check-ignore", "--no-index", "-q", corpus_hidden],
        cwd=ROOT,
        check=False,
    )
    if ignored.returncode != 0:
        problems.append(f"generated blind-sample key is not ignored: {corpus_hidden}")

    web_package = json.loads((ROOT / "apps" / "web" / "package.json").read_text(encoding="utf-8"))
    expected_web_test = "npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e"
    if web_package.get("scripts", {}).get("test") != expected_web_test:
        problems.append("apps/web npm test builds twice instead of letting Playwright build once")

    docs_workflow = (ROOT / ".github" / "workflows" / "docs.yml").read_text(encoding="utf-8")
    for marker in [
        '"**/*.md"',
        '".github/ISSUE_TEMPLATE/**"',
        '".gitignore"',
        "python -B data/pipeline/tests/test_check_license_claims.py",
        "python -B data/pipeline/tests/test_repository_hygiene.py",
    ]:
        if docs_workflow.count(marker) < (2 if marker.startswith('"') else 1):
            problems.append(f"docs workflow does not own public-hygiene marker {marker!r}")

    asset_provenance = (ROOT / "apps" / "site" / "ASSETS.md").read_text(encoding="utf-8")
    visible_provenance = re.sub(r"<!--.*?-->", "", asset_provenance, flags=re.DOTALL)
    if "were removed in PR #109" not in visible_provenance:
        problems.append("landing asset provenance does not name PR #109 as the duplicate-PNG deletion")

    with tempfile.TemporaryDirectory() as directory:
        fixture_root = Path(directory)
        fixture_doc = fixture_root / "README.md"
        fixture_doc.write_text("[missing](docs/missing.md)\n", encoding="utf-8")
        if not local_link_problems(fixture_root, [fixture_doc]):
            problems.append("local-link gate accepted a missing fixture target")
        (fixture_root / "docs").mkdir()
        (fixture_root / "docs" / "missing.md").write_text("present\n", encoding="utf-8")
        if local_link_problems(fixture_root, [fixture_doc]):
            problems.append("local-link gate rejected an existing fixture target")
        reference_doc = fixture_root / "REFERENCE.md"
        reference_doc.write_text("[guide][guide]\n\n[guide]: docs/reference-missing.md\n", encoding="utf-8")
        if not local_link_problems(fixture_root, [reference_doc]):
            problems.append("local-link gate accepted a missing reference-style target")
        parenthesized_target = fixture_root / "docs" / "guide_(v2).md"
        parenthesized_target.write_text("present\n", encoding="utf-8")
        parenthesized_doc = fixture_root / "PARENTHESIZED.md"
        parenthesized_doc.write_text("[guide](docs/guide_(v2).md)\n", encoding="utf-8")
        if local_link_problems(fixture_root, [parenthesized_doc]):
            problems.append("local-link gate rejected a valid balanced-parenthesis target")
        code_doc = fixture_root / "CODE.md"
        code_doc.write_text(
            "```md\n[example](docs/fenced-missing.md)\n```\n"
            "~~~md\n[example](docs/tilde-fenced-missing.md)\n~~~\n"
            "- ```md\n  [example](docs/list-fenced-missing.md)\n  ```\n"
            "    [example](docs/indented-missing.md)\n"
            "`[example](docs/inline-missing.md)`\n"
            "<!-- [example](docs/comment-missing.md) -->\n",
            encoding="utf-8",
        )
        if local_link_problems(fixture_root, [code_doc]):
            problems.append("local-link gate treated code or an HTML comment as a real link")
        titled_doc = fixture_root / "TITLED.md"
        titled_doc.write_text('[guide](docs/missing.md "Fixture title")\n', encoding="utf-8")
        if local_link_problems(fixture_root, [titled_doc]):
            problems.append("local-link gate rejected a valid titled destination")
        image_doc = fixture_root / "IMAGE.md"
        image_doc.write_text("![missing](docs/missing-image.png)\n", encoding="utf-8")
        if not local_link_problems(fixture_root, [image_doc]):
            problems.append("local-link gate accepted a missing image target")
        literal_doc = fixture_root / "LITERALS.md"
        literal_doc.write_text(
            "\\[literal](docs/escaped-literal-missing.md)\n"
            "plain text](docs/plain-text-missing.md)\n",
            encoding="utf-8",
        )
        if local_link_problems(fixture_root, [literal_doc]):
            problems.append("local-link gate treated escaped or plain-text syntax as a link")
        escaped_backticks_doc = fixture_root / "ESCAPED_BACKTICKS.md"
        escaped_backticks_doc.write_text(
            "\\`[live](docs/escaped-backtick-missing.md)\\`\n",
            encoding="utf-8",
        )
        if not local_link_problems(fixture_root, [escaped_backticks_doc]):
            problems.append("local-link gate concealed a live link between escaped backticks")
        undefined_reference_doc = fixture_root / "UNDEFINED_REFERENCE.md"
        undefined_reference_doc.write_text("[guide][missing-definition]\n", encoding="utf-8")
        if not local_link_problems(fixture_root, [undefined_reference_doc]):
            problems.append("local-link gate accepted an undefined reference use")
        malformed_doc = fixture_root / "MALFORMED.md"
        malformed_doc.write_text("[guide](docs/missing.md\n", encoding="utf-8")
        if not local_link_problems(fixture_root, [malformed_doc]):
            problems.append("local-link gate accepted an unterminated inline destination")

    problems.extend(local_link_problems(ROOT, tracked_markdown_files(ROOT)))

    if problems:
        print(f"{len(problems)} repository-hygiene failure(s):", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1
    print("repository-hygiene gate passes: public issue surfaces, generated files, and local links match the tree.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
