//! The falsifiable claim the whole simulator rests on, checked mechanically
//! rather than left as a doc comment someone has to trust: "the oracle
//! never reads the engine's θ, due list, or word states" (BRIEF-014's own
//! Done clause). `src/oracle.rs`'s own doc comment states this in prose;
//! this test is the reason a reviewer does not have to take that prose on
//! faith — it reads the file's own source and refuses any non-comment
//! reference to `superb_core` at all, which is stricter than the claim
//! needs (the oracle could in principle import `superb_core` for something
//! harmless) and therefore never gives a false pass.
//!
//! A plain substring search over the whole file would trip on this test's
//! own doc comments quoting `superb_core` in prose, so comment lines are
//! stripped first — line-based, not `syn`-based: this crate takes no new
//! dependency, and a line-based strip is the right size of mechanism for
//! one file with no block comments.

use std::fs;
use std::path::Path;

#[test]
fn oracle_source_never_mentions_superb_core_outside_a_comment() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/oracle.rs");
    let source =
        fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));

    let code_only: String = source
        .lines()
        .filter(|line| !line.trim_start().starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");

    assert!(
        !code_only.contains("superb_core"),
        "src/oracle.rs references superb_core outside a comment — the oracle must never read \
         the engine's θ, due list, or word states:\n{code_only}"
    );

    // Belt and braces: the specific reads the brief names, even spelled
    // through a re-export or a different path.
    for forbidden in [
        "LearnerState",
        "due_words",
        "backlog_active",
        "WordState",
        "theta()",
        "theta_se()",
    ] {
        assert!(
            !code_only.contains(forbidden),
            "src/oracle.rs references `{forbidden}` outside a comment"
        );
    }
}
