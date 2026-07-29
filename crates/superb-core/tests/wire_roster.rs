//! Two checks. The first is workspace-wide; the second is `superb-core`'s
//! own.
//!
//! **The first** confirms `wire-roster.toml` (workspace root) and every
//! `.rs` file under every workspace member's `src/` cannot disagree about
//! which types carry a tracked derive or a hand-written impl of the trait a
//! derive would have provided (ADR-016 D3, D4). Default-deny only holds if
//! something checks it; this is that something.
//!
//! **Workspace-wide, not `superb-core`-only, since issue #32.** The roster
//! used to scan `superb-core`'s own `src/` alone, on the strength of being
//! the only crate that carried a tracked derive when it was written. That
//! stopped being true the day `superb-wasm/src/wire.rs` grew its own
//! camelCase mirror of the seam — eleven types, entirely outside the
//! roster's field of view, disclosed and reviewed but not *enforced*. The
//! member list is read from `cargo metadata`, never hand-maintained here:
//! the whole failure mode issue #32 names is a second (and predictably, a
//! third — `superb-ffi` is next) crate arriving with nobody having
//! remembered to add its path to a list. A crate that is a workspace member
//! is in scope by construction; there is no path to add.
//!
//! Because two crates are free to declare a type of the same simple name,
//! the roster and the code are compared keyed on **`(crate, type)`**, not
//! bare type name — `wire-roster.toml`'s own header explains why.
//!
//! This parses source with `syn` rather than scanning lines, so it sees a
//! derive list `cargo fmt` wraps across lines, a type of any visibility in
//! any file under `src/`, a derive spelled as a fully qualified path, and a
//! hand-written `impl Serialize for X` with no derive at all.
//!
//! What it still cannot see, enumerated because an understated blind spot is
//! worse than a known one. The walk descends into `mod` and nothing else, so
//! an item is invisible when it sits inside a function body, inside a method
//! body, or inside an anonymous `const _: () = { ... };` — that last being
//! the exact shape `serde_derive` expands into, so the mechanism is blind to
//! the construction it most exists to police. A `#[path = "../outside.rs"]`
//! module escapes the `src/` walk. Nested `cfg_attr` is not unwrapped past
//! one level. An aliased import (`use serde::Serialize as Ser`) reads as an
//! unrelated trait. Beyond the walk: an impl produced by a macro this parser
//! does not expand, `#[serde(remote = "...")]`, a blanket impl arriving from
//! another crate, and anything `build.rs` generates. And new with the
//! workspace-wide walk: a `[[bin]]` or example living outside a member's
//! `src/` (none does today) is invisible by the same construction that keeps
//! this reading `src/` and not the compiled artifact.
//!
//! It reads `src/` in the repository, not the compiled artifact. The honest
//! statement of the guarantee is **default-deny against declaration-position
//! items in every workspace member's own source** — not default-deny in the
//! absolute sense.
//!
//! **The second** confirms `superb-core`'s *runtime* dependency graph — a
//! different and wider-reaching kind of promise, and one that has no reason
//! to generalize to every crate the way the roster does — has not grown past
//! what `serde`, `toml`, and `serde_json` themselves require (engine-contract
//! §1, CLAUDE.md law 2).

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Deserialize;
use serde_json::Value;
use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::{Attribute, Item, Meta, Token, Type};

/// The four derives (or their hand-written equivalents) the roster tracks.
const TRACKED_DERIVES: [&str; 4] = ["Serialize", "Deserialize", "PartialOrd", "Ord"];

/// Every `.rs` file under `dir`, walked recursively.
fn collect_rs_files(dir: &Path, files: &mut Vec<PathBuf>) {
    let entries = fs::read_dir(dir).unwrap_or_else(|e| panic!("read_dir({}): {e}", dir.display()));
    for entry in entries {
        let path = entry.expect("dir entry is readable").path();
        if path.is_dir() {
            collect_rs_files(&path, files);
        } else if path.extension().is_some_and(|ext| ext == "rs") {
            files.push(path);
        }
    }
}

/// `path`'s last segment, name-resolved only as far as syntax allows:
/// `Serialize`, `serde::Serialize` and `::serde::Serialize` all resolve to
/// `"Serialize"`, but an aliased import does not (see the module doc).
/// Returns `None` for a path that names something this roster does not
/// track.
fn tracked_trait_name(path: &syn::Path) -> Option<String> {
    let name = path.segments.last()?.ident.to_string();
    TRACKED_DERIVES.contains(&name.as_str()).then_some(name)
}

/// Every tracked derive `attrs` places on the item it governs, seeing
/// through `#[cfg_attr(..., derive(...))]` exactly as though it were a plain
/// `#[derive(...)]` — CI runs `--all-features`, so a `cfg_attr`-gated derive
/// is live in the build being checked.
fn tracked_derives_in_attrs(attrs: &[Attribute]) -> BTreeSet<String> {
    let mut tracked = BTreeSet::new();
    let parse_paths = Punctuated::<syn::Path, Token![,]>::parse_terminated;

    for attr in attrs {
        if attr.path().is_ident("derive") {
            let paths = attr
                .parse_args_with(parse_paths)
                .expect("#[derive(...)] is a comma-separated list of paths");
            tracked.extend(paths.iter().filter_map(tracked_trait_name));
        } else if attr.path().is_ident("cfg_attr") {
            let metas = attr
                .parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated)
                .expect("#[cfg_attr(...)] is a comma-separated list of a predicate and meta items");
            for meta in &metas {
                if let Meta::List(list) = meta {
                    if list.path.is_ident("derive") {
                        let paths = parse_paths
                            .parse2(list.tokens.clone())
                            .expect("cfg_attr's derive(...) is a comma-separated list of paths");
                        tracked.extend(paths.iter().filter_map(tracked_trait_name));
                    }
                }
            }
        }
    }

    tracked
}

/// The simple name of the type a `impl ... for Target` governs, ignoring any
/// generic parameters on `Target`.
fn impl_target_name(self_ty: &Type) -> Option<String> {
    match self_ty {
        Type::Path(type_path) => Some(type_path.path.segments.last()?.ident.to_string()),
        _ => None,
    }
}

/// Walks `items`, recursing into inline `mod { .. }` blocks, and records
/// every type carrying a tracked derive or a hand-written impl of a tracked
/// trait. A hand-written impl was invisible to a line-scanner by
/// construction; it is not invisible to a parser.
fn walk_items(items: &[Item], found: &mut BTreeMap<String, BTreeSet<String>>) {
    for item in items {
        match item {
            Item::Struct(item_struct) => {
                let tracked = tracked_derives_in_attrs(&item_struct.attrs);
                if !tracked.is_empty() {
                    found
                        .entry(item_struct.ident.to_string())
                        .or_default()
                        .extend(tracked);
                }
            }
            Item::Enum(item_enum) => {
                let tracked = tracked_derives_in_attrs(&item_enum.attrs);
                if !tracked.is_empty() {
                    found
                        .entry(item_enum.ident.to_string())
                        .or_default()
                        .extend(tracked);
                }
            }
            Item::Impl(item_impl) => {
                // `trait_` is `None` for an inherent impl and carries a `!`
                // for a negative impl (`impl !Send for X`); neither governs
                // a tracked trait, so only a plain `impl Trait for X` counts.
                if let Some((None, trait_path, _)) = &item_impl.trait_ {
                    if let (Some(trait_name), Some(target_name)) = (
                        tracked_trait_name(trait_path),
                        impl_target_name(&item_impl.self_ty),
                    ) {
                        found.entry(target_name).or_default().insert(trait_name);
                    }
                }
            }
            Item::Mod(item_mod) => {
                if let Some((_, inner_items)) = &item_mod.content {
                    walk_items(inner_items, found);
                }
            }
            _ => {}
        }
    }
}

/// `wire-roster.toml`, deserialized against its own schema — every entry
/// requires `name`, `crate`, `tier`, `derives`, `consumer` and
/// `authorized_by`, `note` is optional, no other field is accepted, and
/// `tier` is one of exactly two values. A roster that does not match this
/// schema fails here rather than silently keeping only the fields the
/// comparison below reads.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Roster {
    #[serde(rename = "type")]
    entries: Vec<RosterEntry>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RosterEntry {
    name: String,
    #[serde(rename = "crate")]
    crate_name: String,
    #[allow(dead_code)] // read by the schema check; the comparison below does not need it
    tier: Tier,
    derives: Vec<String>,
    #[allow(dead_code)]
    consumer: String,
    #[allow(dead_code)]
    authorized_by: String,
    #[serde(default)]
    #[allow(dead_code)]
    note: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Tier {
    Durable,
    Boundary,
}

/// Every workspace member's package name and the absolute path to its
/// `src/` directory, read from `cargo metadata` rather than a list this file
/// would have to keep in sync with `Cargo.toml` by hand (issue #32's own
/// discharge condition: "the scan must be derived from the workspace
/// members"). `workspace_members` names the packages; `packages[].manifest_path`
/// gives each one's `Cargo.toml`, whose parent directory is the crate root.
fn workspace_member_src_dirs(metadata: &Value) -> Vec<(String, PathBuf)> {
    let member_ids: BTreeSet<&str> = metadata["workspace_members"]
        .as_array()
        .expect("metadata has a workspace_members array")
        .iter()
        .map(|id| id.as_str().expect("workspace member id is a string"))
        .collect();

    metadata["packages"]
        .as_array()
        .expect("metadata has a packages array")
        .iter()
        .filter(|package| {
            member_ids.contains(package["id"].as_str().expect("package id is a string"))
        })
        .map(|package| {
            let name = package["name"]
                .as_str()
                .expect("package name is a string")
                .to_string();
            let manifest_path = package["manifest_path"]
                .as_str()
                .expect("manifest_path is a string");
            let src_dir = Path::new(manifest_path)
                .parent()
                .expect("Cargo.toml has a parent directory")
                .join("src");
            (name, src_dir)
        })
        .collect()
}

#[test]
fn wire_roster_matches_the_code_exactly() {
    let crate_root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let metadata = cargo_metadata(crate_root);
    let members = workspace_member_src_dirs(&metadata);
    assert!(
        members.len() >= 2,
        "expected at least superb-core and one sibling crate in the workspace, found {}: this \
         check's whole point is scanning more than one crate",
        members.len()
    );

    // Keyed on (crate, type name), not bare type name — two crates are free
    // to declare a type of the same simple name, and merging them under one
    // key would let one crate's roster entry silently cover another's type.
    let mut code: BTreeMap<(String, String), BTreeSet<String>> = BTreeMap::new();
    for (crate_name, src_dir) in &members {
        let mut source_files = Vec::new();
        collect_rs_files(src_dir, &mut source_files);
        source_files.sort();
        assert!(
            !source_files.is_empty(),
            "{crate_name}'s src/ ({}) has no .rs files to check",
            src_dir.display()
        );

        let mut found: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        for file in &source_files {
            let source =
                fs::read_to_string(file).unwrap_or_else(|e| panic!("read {}: {e}", file.display()));
            let parsed = syn::parse_file(&source)
                .unwrap_or_else(|e| panic!("{} does not parse as Rust: {e}", file.display()));
            walk_items(&parsed.items, &mut found);
        }
        for (type_name, derives) in found {
            code.insert((crate_name.clone(), type_name), derives);
        }
    }

    // `workspace_root` comes from the same `cargo metadata` call as the
    // member list above, not a hand-counted `../..` — the crate's own
    // nesting depth under `crates/` is exactly the kind of assumption issue
    // #32 exists to stop encoding by hand.
    let workspace_root = metadata["workspace_root"]
        .as_str()
        .expect("metadata has a workspace_root string");
    let roster_source = fs::read_to_string(Path::new(workspace_root).join("wire-roster.toml"))
        .expect("read wire-roster.toml at the workspace root");
    let roster: Roster = toml::from_str(&roster_source).unwrap_or_else(|e| {
        panic!(
            "wire-roster.toml does not match its schema (name, crate, tier, derives, consumer, \
             authorized_by required; note optional; tier is \"durable\" or \"boundary\"; no \
             unknown fields): {e}"
        )
    });

    let listed: BTreeMap<(String, String), BTreeSet<String>> = roster
        .entries
        .iter()
        .map(|entry| {
            (
                (entry.crate_name.clone(), entry.name.clone()),
                entry.derives.iter().cloned().collect(),
            )
        })
        .collect();

    for ((crate_name, type_name), derives) in &code {
        match listed.get(&(crate_name.clone(), type_name.clone())) {
            None => panic!(
                "{crate_name}::{type_name} carries a tracked derive or impl {derives:?} \
                 somewhere under its src/ but has no entry in wire-roster.toml"
            ),
            Some(listed_derives) => assert_eq!(
                derives, listed_derives,
                "{crate_name}::{type_name}: src/ carries {derives:?} but wire-roster.toml lists \
                 {listed_derives:?}"
            ),
        }
    }

    for (crate_name, type_name) in listed.keys() {
        assert!(
            code.contains_key(&(crate_name.clone(), type_name.clone())),
            "wire-roster.toml lists {crate_name}::{type_name}, but nothing under {crate_name}'s \
             src/ carries a tracked derive or impl for it — remove the entry or restore the \
             derive"
        );
    }
}

/// Runs `cargo metadata` from `crate_root` and returns the parsed document.
fn cargo_metadata(crate_root: &Path) -> Value {
    let output = Command::new(env!("CARGO"))
        .args(["metadata", "--format-version", "1", "--locked"])
        .current_dir(crate_root)
        .output()
        .expect("cargo metadata runs");
    assert!(
        output.status.success(),
        "cargo metadata failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).expect("cargo metadata prints valid JSON")
}

/// The package id `cargo metadata` assigned to the package named `name` — the
/// id, not just the name, because the resolve graph below is keyed by id.
fn package_id<'a>(metadata: &'a Value, name: &str) -> &'a str {
    metadata["packages"]
        .as_array()
        .expect("metadata has a packages array")
        .iter()
        .find(|package| package["name"].as_str() == Some(name))
        .unwrap_or_else(|| panic!("cargo metadata lists a package named {name}"))["id"]
        .as_str()
        .expect("package id is a string")
}

/// `name@version` for `id`, so a failing assertion names a crate a human can
/// read rather than a raw package id.
fn describe(metadata: &Value, id: &str) -> String {
    let package = metadata["packages"]
        .as_array()
        .expect("metadata has a packages array")
        .iter()
        .find(|package| package["id"].as_str() == Some(id))
        .unwrap_or_else(|| panic!("cargo metadata describes package {id}"));
    format!(
        "{}@{}",
        package["name"].as_str().unwrap_or("?"),
        package["version"].as_str().unwrap_or("?")
    )
}

/// Every package id reachable from `root_id` by following only the edges
/// `cargo metadata` tags `normal` (serialized as a `null` kind) — the edges
/// that reach the built artifact, as opposed to a `dev` or `build`
/// dependency of something on the path.
fn normal_closure(metadata: &Value, root_id: &str) -> BTreeSet<String> {
    let nodes = metadata["resolve"]["nodes"]
        .as_array()
        .expect("metadata has resolve.nodes");
    let by_id: BTreeMap<&str, &Value> = nodes
        .iter()
        .map(|node| (node["id"].as_str().expect("node id is a string"), node))
        .collect();

    let mut closure = BTreeSet::new();
    closure.insert(root_id.to_string());
    let mut frontier = vec![root_id.to_string()];

    while let Some(id) = frontier.pop() {
        let node = by_id[id.as_str()];
        for dep in node["deps"].as_array().expect("node has deps") {
            let is_normal = dep["dep_kinds"]
                .as_array()
                .expect("dep has dep_kinds")
                .iter()
                .any(|kind| kind["kind"].is_null());
            if !is_normal {
                continue;
            }
            let dep_id = dep["pkg"]
                .as_str()
                .expect("dep pkg is a string")
                .to_string();
            if closure.insert(dep_id.clone()) {
                frontier.push(dep_id);
            }
        }
    }

    closure
}

/// The shipped library's runtime dependency closure is exactly what `serde`,
/// `toml`, and `serde_json` themselves require — no more (engine-contract
/// §1, CLAUDE.md law 2). `toml` is the direct runtime dependency BRIEF-007
/// authorizes, to parse `tuning.toml` at compile time. `serde_json` is the
/// direct runtime dependency BRIEF-008 authorizes (ASK-004: the persisted
/// document is text, and its owner can open it) — `LearnerState::load` and
/// `LearnerState::to_document` are its consumers. A new normal dependency,
/// direct or transitive, is not read off a hand-maintained list of permitted
/// crate names; it is computed from the same graph `cargo` builds from, so a
/// dependency this test has never heard of still fails, and names itself.
#[test]
fn superb_core_ships_no_runtime_dependency_beyond_serde_toml_and_serde_json() {
    let crate_root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let metadata = cargo_metadata(crate_root);

    let superb_core_id = package_id(&metadata, "superb-core").to_string();
    let serde_id = package_id(&metadata, "serde").to_string();
    let toml_id = package_id(&metadata, "toml").to_string();
    let serde_json_id = package_id(&metadata, "serde_json").to_string();

    let mut shipped = normal_closure(&metadata, &superb_core_id);
    shipped.remove(&superb_core_id);
    let mut permitted = normal_closure(&metadata, &serde_id);
    permitted.extend(normal_closure(&metadata, &toml_id));
    permitted.extend(normal_closure(&metadata, &serde_json_id));

    let extra: Vec<String> = shipped
        .difference(&permitted)
        .map(|id| describe(&metadata, id))
        .collect();

    assert!(
        extra.is_empty(),
        "superb-core's normal (runtime) dependency closure has grown beyond what serde, toml \
         and serde_json require: {extra:?}. A new runtime dependency needs an ADR \
         (engine-contract §1, CLAUDE.md law 2), not a Cargo.toml edit."
    );
}
