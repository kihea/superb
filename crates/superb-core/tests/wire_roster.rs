//! Confirms `wire-roster.toml` and `src/state.rs` cannot disagree about which
//! types carry a tracked derive (ADR-016 D3, D4). Default-deny only holds if
//! something checks it; this is that something.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

/// The four derives the roster tracks.
const TRACKED_DERIVES: [&str; 4] = ["Serialize", "Deserialize", "PartialOrd", "Ord"];

/// Scans `source` for `#[derive(...)]` attributes immediately governing a
/// `pub enum` or `pub struct`, and returns each such type's tracked derives.
/// A type with no tracked derive is absent from the result, matching the
/// roster's own rule: nothing untracked gets an entry.
fn tracked_derives_in_source(source: &str) -> BTreeMap<String, Vec<String>> {
    let mut found = BTreeMap::new();
    let mut pending_derives: Option<Vec<String>> = None;

    for raw_line in source.lines() {
        let line = raw_line.trim();

        if let Some(inner) = line
            .strip_prefix("#[derive(")
            .and_then(|rest| rest.strip_suffix(")]"))
        {
            pending_derives = Some(
                inner
                    .split(',')
                    .map(|derive| derive.trim().to_string())
                    .filter(|derive| !derive.is_empty())
                    .collect(),
            );
            continue;
        }

        // Other attributes (e.g. `#[serde(...)]`) and doc comments sit
        // between a derive and the item it governs; neither clears the
        // pending derive list.
        if line.is_empty()
            || line.starts_with('#')
            || line.starts_with("///")
            || line.starts_with("//!")
        {
            continue;
        }

        if let Some(rest) = line
            .strip_prefix("pub enum ")
            .or_else(|| line.strip_prefix("pub struct "))
        {
            if let Some(derives) = pending_derives.take() {
                let name = rest
                    .split(|c: char| c.is_whitespace() || c == '{' || c == '(' || c == ';')
                    .next()
                    .unwrap_or_default()
                    .to_string();
                let tracked: Vec<String> = derives
                    .into_iter()
                    .filter(|derive| TRACKED_DERIVES.contains(&derive.as_str()))
                    .collect();
                if !tracked.is_empty() {
                    found.insert(name, tracked);
                }
            }
            continue;
        }

        // Any other line — code, a closing brace, an `impl` — means whatever
        // derive was pending governed something that was not a tracked type.
        pending_derives = None;
    }

    found
}

/// The roster, as `wire-roster.toml` declares it: type name to tracked
/// derive set. Panics on a malformed roster — a roster that cannot be read
/// is a roster this test cannot check the code against.
fn tracked_derives_in_roster(roster: &str) -> BTreeMap<String, Vec<String>> {
    let parsed: toml::Value = roster.parse().expect("wire-roster.toml is valid TOML");
    let entries = parsed
        .get("type")
        .and_then(toml::Value::as_array)
        .expect("wire-roster.toml has a [[type]] array");

    entries
        .iter()
        .map(|entry| {
            let name = entry
                .get("name")
                .and_then(toml::Value::as_str)
                .expect("roster entry has a name")
                .to_string();
            let derives = entry
                .get("derives")
                .and_then(toml::Value::as_array)
                .expect("roster entry has a derives list")
                .iter()
                .map(|derive| {
                    derive
                        .as_str()
                        .expect("roster derive is a string")
                        .to_string()
                })
                .collect();
            (name, derives)
        })
        .collect()
}

#[test]
fn wire_roster_matches_the_code_exactly() {
    let crate_root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let source = fs::read_to_string(crate_root.join("src/state.rs")).expect("read src/state.rs");
    let roster =
        fs::read_to_string(crate_root.join("wire-roster.toml")).expect("read wire-roster.toml");

    let mut code = tracked_derives_in_source(&source);
    let mut listed = tracked_derives_in_roster(&roster);

    for derives in code.values_mut() {
        derives.sort();
    }
    for derives in listed.values_mut() {
        derives.sort();
    }

    for (name, derives) in &code {
        match listed.get(name) {
            None => panic!(
                "{name} carries a tracked derive {derives:?} in src/state.rs \
                 but has no entry in wire-roster.toml"
            ),
            Some(listed_derives) => assert_eq!(
                derives, listed_derives,
                "{name}: src/state.rs derives {derives:?} but wire-roster.toml lists \
                 {listed_derives:?}"
            ),
        }
    }

    for name in listed.keys() {
        assert!(
            code.contains_key(name),
            "wire-roster.toml lists {name}, but src/state.rs does not derive any \
             tracked trait for it — remove the entry or restore the derive"
        );
    }
}
