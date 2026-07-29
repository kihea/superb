//! Issue #33: "the wire's field names are pinned only where the fixtures
//! happen to reach." The wire roster (`wire_roster.rs`) asks *may this type
//! be serialized*; this asks *is what it serializes actually pinned by
//! anything* — the roster's own shape, one level out, and its own doc
//! comment says so. Kept as a separate file rather than merged into the
//! roster's, for the same reason `structural_invariants.rs` duplicates
//! `wire_roster.rs`'s file-walk instead of sharing it: each file under
//! `tests/` compiles as its own crate, and the two checks answer different
//! questions that happen to share a technique.
//!
//! **The property.** Every named field, on every type reachable from
//! [`golden_vectors.rs`](golden_vectors.rs)'s own `Header` and from `Effect`
//! — the four types a golden vector's JSON is actually built from —
//! resolves to a JSON key that appears somewhere in `tests/golden/*.jsonl`.
//! A field that appears in none of them is a field a serde rename can move
//! in silence: the exhaustive `From` conversions in `superb-wasm/src/wire.rs`
//! (a different, already-pinned link in the same chain) only guarantee the
//! *shape* survives, never the *spelling*, and `#[serde(default)]` means a
//! renamed field does not even fail to deserialize — it just quietly starts
//! reading as absent.
//!
//! **Roots, and why exactly these four.** `golden_vectors.rs`'s `Header`
//! struct is `{ initial_state: LearnerState, now: u64, event: Event, frame:
//! Frame }`, and the file it replays is that header plus a `Vec<Effect>`.
//! Those are the only four types a golden vector's bytes are made of, so
//! they are the roots — not the wire roster's full type list, which also
//! covers `Tuning`/`Affinity`/`PoolAffinity` (pinned by `tuning.toml`'s own
//! round-trip test, never by a golden vector) and the boundary types
//! `Needs`/`Request`/`Candidate`/`Slot`/`ContentFrame` that only `plan()`
//! and the composer touch. Reusing the roster's enumeration wholesale would
//! flag all of those as "uncovered" for a reason that has nothing to do with
//! this property — a false alarm on day one is how a check earns the right
//! to be ignored on day thirty.
//!
//! **Two named exclusions, checked rather than assumed.** `Frame::Content`
//! and `Effect::PassageComposed` are real variants of two of the four root
//! types, and this file does not walk into either. Not a judgment call: see
//! `golden_vectors.rs::regenerate` — the only place a golden vector is ever
//! replayed — constructs exactly one `Request` variant, `ProcessEvent`,
//! never `NextPassage`. `Effect::PassageComposed` is `decide()`'s response
//! to `NextPassage` and nothing else; it is not merely uncovered today, it
//! is **structurally unreachable by this harness as written**, and so is
//! everything under it (`Passage`, `SlotFill`) and under `Frame::Content`
//! (`ContentFrame`, `Candidate`, `Slot`, `Pool`). Closing that gap needs a
//! decision this file does not make: whether `golden_vectors.rs`'s `Header`
//! grows a `NextPassage` shape (and what a fixture for it looks like), or a
//! second harness exists beside it. Manufacturing a `Content`/`PassageComposed`
//! fixture that `decide()` never actually reads on the code path it is
//! attached to would tick this check without pinning anything — exactly the
//! "mechanism silently inert while looking installed" failure `wire.rs`'s
//! own doc comment names as the thing ADR-022 already voided a milestone
//! gate over. `the_passage_composed_exclusion_is_still_true_of_golden_vectors_rs`
//! below re-parses `golden_vectors.rs` and fails if `NextPassage` ever
//! appears there, so the day the harness grows that support, this file's
//! own exclusion list is what goes stale and loud, not silent.
//!
//! **The corpus is `tests/golden/*.jsonl` only** — not the frozen v1 fixture,
//! not `LearnerState`'s own round-trip tests. `EnvelopeV1` (`v`, `_note`) is
//! consequently out of scope by the same root-based reasoning: it is never
//! part of a `Header` or an `Effect`, so it was never a candidate to begin
//! with, not an oversight.
//!
//! **The membership check is a flat, name-only one, stated so it is not
//! mistaken for more.** A field's JSON key is checked for presence anywhere
//! in the whole corpus's key set — not specifically nested under *that
//! type's own* JSON shape. Two different fields that happen to share a
//! spelling (`Frame::Topics.topics` and `Passage.topics`, had `Passage` not
//! already been excluded above) would cover each other by coincidence. This
//! is the same class of blind spot `wire_roster.rs` and
//! `structural_invariants.rs` both name in their own doc comments rather
//! than pretend past, and the issue's own discharge text asks for exactly
//! this membership shape ("fail with the names of any field that appears in
//! none").
//!
//! **Other named blind spots**, inherited from `wire_roster.rs`'s method: the
//! walk descends into `mod {}` and nothing else. Only named-field structs and
//! named-field enum variants are inspected — a tuple struct (`Timestamp`) or
//! a fieldless enum (`WordState`) contributes no field of its own to check,
//! though a field *of* one of those types is still checked (its own name, on
//! its own enclosing type). A tuple-variant's wrapped type (there are none
//! among the roots once the two exclusions above are applied) is not walked
//! into — this file's scope never needs that case, and it is named rather
//! than silently working by accident.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use syn::{Fields, GenericArgument, Item, PathArguments, Type};

/// Enum variant, by (enclosing type, variant name), that this file does not
/// walk into — see the module doc's "two named exclusions."
const EXCLUDED_VARIANTS: [(&str, &str); 2] = [("Frame", "Content"), ("Effect", "PassageComposed")];

/// The four types a golden vector's bytes are actually built from — see the
/// module doc's "Roots."
const ROOTS: [&str; 4] = ["LearnerState", "Event", "Frame", "Effect"];

/// One named field, resolved to the JSON key it actually serializes as.
struct FieldRef {
    /// `Type` for a struct field, `Type::Variant` for an enum variant's
    /// field — only used to make a failure message readable.
    owner: String,
    json_key: String,
    #[allow(dead_code)] // read only by referenced_type_names at collection time, not after
    ty: Type,
}

/// One type's shape, exactly as much of it as this file needs: for a
/// struct, its named fields (empty if it is a tuple or unit struct — see the
/// module doc); for an enum, each variant's name and named fields (empty for
/// a unit or tuple variant).
enum TypeShape {
    Struct(Vec<(String, Type)>),
    Enum(Vec<(String, Vec<(String, Type)>)>),
}

/// `Some(field name's effective JSON key)` computed from a
/// `#[serde(rename = "...")]` attribute if present, else the field's own
/// identifier — `superb-core` never applies `rename_all` to a struct's or a
/// variant's *fields* (only to enum *tags*, in `signals.rs` and `state.rs`),
/// so the identifier is the key everywhere this file's roots reach except
/// the one explicit rename this function reads directly off the attribute.
fn json_key_for(ident: &str, attrs: &[syn::Attribute]) -> String {
    for attr in attrs {
        if attr.path().is_ident("serde") {
            let mut renamed = None;
            let _ = attr.parse_nested_meta(|meta| {
                if meta.path.is_ident("rename") {
                    let value = meta.value()?;
                    let lit: syn::LitStr = value.parse()?;
                    renamed = Some(lit.value());
                }
                Ok(())
            });
            if let Some(name) = renamed {
                return name;
            }
        }
    }
    ident.to_string()
}

/// Named fields only, in declaration order — a tuple or unit shape
/// contributes nothing (module doc).
fn named_fields(fields: &Fields) -> Vec<(String, Type)> {
    match fields {
        Fields::Named(named) => named
            .named
            .iter()
            .map(|field| {
                let ident = field.ident.as_ref().expect("named field has an ident");
                (
                    json_key_for(&ident.to_string(), &field.attrs),
                    field.ty.clone(),
                )
            })
            .collect(),
        Fields::Unnamed(_) | Fields::Unit => Vec::new(),
    }
}

/// Every `.rs` file under `dir`, walked recursively — identical in shape to
/// `wire_roster.rs`'s own helper of the same name; duplicated rather than
/// shared, per this file's own module doc.
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

/// Walks `items`, recursing into inline `mod {}` blocks, recording every
/// named-field struct and every enum (variant-by-variant) it finds.
fn walk_items(items: &[Item], types: &mut BTreeMap<String, TypeShape>) {
    for item in items {
        match item {
            Item::Struct(item_struct) => {
                types.insert(
                    item_struct.ident.to_string(),
                    TypeShape::Struct(named_fields(&item_struct.fields)),
                );
            }
            Item::Enum(item_enum) => {
                let variants = item_enum
                    .variants
                    .iter()
                    .map(|variant| (variant.ident.to_string(), named_fields(&variant.fields)))
                    .collect();
                types.insert(item_enum.ident.to_string(), TypeShape::Enum(variants));
            }
            Item::Mod(item_mod) => {
                if let Some((_, inner_items)) = &item_mod.content {
                    walk_items(inner_items, types);
                }
            }
            _ => {}
        }
    }
}

/// Every locally-nameable type this field's type mentions, closest first:
/// the type path's own last segment, then (recursively) whatever sits inside
/// its angle-bracketed generic arguments. This is what lets `Vec<Foo>`,
/// `Option<Foo>`, and `BTreeMap<String, Foo>` all resolve to `Foo` without
/// this file naming `Vec`, `Option`, or `BTreeMap` anywhere — a name that is
/// not in `types` (a primitive, `String`, or a generic container itself) is
/// simply never found in the map and treated as a leaf, harmlessly.
fn referenced_type_names(ty: &Type, out: &mut Vec<String>) {
    match ty {
        Type::Path(type_path) => {
            if let Some(segment) = type_path.path.segments.last() {
                out.push(segment.ident.to_string());
                if let PathArguments::AngleBracketed(args) = &segment.arguments {
                    for arg in &args.args {
                        if let GenericArgument::Type(inner) = arg {
                            referenced_type_names(inner, out);
                        }
                    }
                }
            }
        }
        Type::Reference(reference) => referenced_type_names(&reference.elem, out),
        _ => {}
    }
}

/// Breadth-first from `ROOTS`, skipping `EXCLUDED_VARIANTS`, collecting every
/// named field this file's scope reaches.
fn reachable_fields(types: &BTreeMap<String, TypeShape>) -> Vec<FieldRef> {
    let mut fields = Vec::new();
    let mut visited: BTreeSet<String> = BTreeSet::new();
    let mut frontier: Vec<String> = ROOTS.iter().map(|s| s.to_string()).collect();

    while let Some(type_name) = frontier.pop() {
        if !visited.insert(type_name.clone()) {
            continue;
        }
        let Some(shape) = types.get(&type_name) else {
            continue; // a leaf: foreign, primitive, or a shape this file does not walk (tuple/unit).
        };

        let mut owned_fields: Vec<(String, String, Type)> = Vec::new();
        match shape {
            TypeShape::Struct(struct_fields) => {
                for (json_key, ty) in struct_fields {
                    owned_fields.push((type_name.clone(), json_key.clone(), ty.clone()));
                }
            }
            TypeShape::Enum(variants) => {
                for (variant_name, variant_fields) in variants {
                    if EXCLUDED_VARIANTS.contains(&(type_name.as_str(), variant_name.as_str())) {
                        continue;
                    }
                    let owner = format!("{type_name}::{variant_name}");
                    for (json_key, ty) in variant_fields {
                        owned_fields.push((owner.clone(), json_key.clone(), ty.clone()));
                    }
                }
            }
        }

        for (owner, json_key, ty) in owned_fields {
            let mut referenced = Vec::new();
            referenced_type_names(&ty, &mut referenced);
            for name in referenced {
                if !visited.contains(&name) {
                    frontier.push(name);
                }
            }
            fields.push(FieldRef {
                owner,
                json_key,
                ty,
            });
        }
    }

    fields
}

/// Every JSON object key appearing anywhere in `value`, walked recursively —
/// keys of a nested object, and of every element of an array. This is the
/// flat, name-only corpus this file's membership check reads from (module
/// doc: "The membership check is a flat, name-only one").
fn collect_keys(value: &Value, keys: &mut BTreeSet<String>) {
    match value {
        Value::Object(map) => {
            for (key, inner) in map {
                keys.insert(key.clone());
                collect_keys(inner, keys);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_keys(item, keys);
            }
        }
        _ => {}
    }
}

/// Every JSON key appearing anywhere in `tests/golden/*.jsonl`.
fn golden_vector_key_set(golden_dir: &Path) -> BTreeSet<String> {
    let mut keys = BTreeSet::new();
    let mut paths: Vec<PathBuf> = fs::read_dir(golden_dir)
        .unwrap_or_else(|e| panic!("read_dir({}): {e}", golden_dir.display()))
        .map(|entry| entry.expect("dir entry is readable").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "jsonl"))
        .collect();
    paths.sort();
    assert!(
        !paths.is_empty(),
        "{} has no .jsonl vectors",
        golden_dir.display()
    );

    for path in paths {
        let content =
            fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let value: Value = serde_json::from_str(line)
                .unwrap_or_else(|e| panic!("{}: line does not parse as JSON: {e}", path.display()));
            collect_keys(&value, &mut keys);
        }
    }
    keys
}

/// Every reachable field whose JSON key appears in no member of
/// `corpus_keys`, formatted for a failure message.
fn uncovered_fields(fields: &[FieldRef], corpus_keys: &BTreeSet<String>) -> Vec<String> {
    fields
        .iter()
        .filter(|f| !corpus_keys.contains(&f.json_key))
        .map(|f| format!("{} (key {:?})", f.owner, f.json_key))
        .collect()
}

#[test]
fn every_field_reachable_from_a_golden_vectors_root_appears_in_the_corpus() {
    let crate_root = Path::new(env!("CARGO_MANIFEST_DIR"));

    let mut source_files = Vec::new();
    collect_rs_files(&crate_root.join("src"), &mut source_files);
    source_files.sort();
    assert!(!source_files.is_empty(), "src/ has no .rs files to check");

    let mut types = BTreeMap::new();
    for file in &source_files {
        let source =
            fs::read_to_string(file).unwrap_or_else(|e| panic!("read {}: {e}", file.display()));
        let parsed = syn::parse_file(&source)
            .unwrap_or_else(|e| panic!("{} does not parse as Rust: {e}", file.display()));
        walk_items(&parsed.items, &mut types);
    }

    let fields = reachable_fields(&types);
    assert!(
        fields.len() > 10,
        "expected the walk from {ROOTS:?} to reach more than a handful of fields; found {}. \
         Either the roots changed shape or this check's own walk broke.",
        fields.len()
    );

    let corpus_keys = golden_vector_key_set(&crate_root.join("tests/golden"));
    let missing = uncovered_fields(&fields, &corpus_keys);

    assert!(
        missing.is_empty(),
        "field(s) reachable from a golden vector's own root types ({}) never appear in any \
         committed vector under tests/golden/ — a serde rename to any of these would compile, \
         satisfy every other check, and go live unnoticed (issue #33). Add a new golden vector \
         that exercises the field; do not regenerate an existing one to manufacture coverage:\n{}",
        ROOTS.join(", "),
        missing.join("\n")
    );
}

/// The exclusion list above is a claim about `golden_vectors.rs`'s own
/// source, not an assumption about it — this re-reads that file and fails if
/// `NextPassage` ever appears there, because that is the day
/// `Effect::PassageComposed` stops being structurally unreachable and this
/// file's own exclusion becomes the next thing that is stale rather than
/// current.
#[test]
fn the_passage_composed_exclusion_is_still_true_of_golden_vectors_rs() {
    let crate_root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let path = crate_root.join("tests/golden_vectors.rs");
    let source =
        fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    assert!(
        !source.contains("NextPassage"),
        "{} now mentions NextPassage — this file's Frame::Content / \
         Effect::PassageComposed exclusion (see this file's own module doc) was justified by \
         golden_vectors.rs only ever constructing Request::ProcessEvent. That justification just \
         broke: the exclusion needs re-deciding, not silently kept.",
        path.display()
    );
}

mod fixtures {
    //! The standing rule (issue #32's own citation of it): a check whose
    //! outcome is an enforcement mechanism demonstrates the evasion it
    //! closes. These run the real walk and the real corpus-membership logic
    //! against small embedded sources and hand-built corpora, the same
    //! pattern `structural_invariants.rs`'s own fixture tests use, so the
    //! demonstration is permanent rather than a scratch commit that only
    //! ever ran once.

    use super::*;

    fn types_in(source: &str) -> BTreeMap<String, TypeShape> {
        let parsed = syn::parse_file(source).expect("fixture source parses as Rust");
        let mut types = BTreeMap::new();
        walk_items(&parsed.items, &mut types);
        types
    }

    /// A `LearnerState`-shaped fixture whose one field is covered by a
    /// one-entry corpus — the walk finds it, the membership check passes.
    #[test]
    fn a_field_present_in_the_corpus_is_not_flagged() {
        let source = r#"
            pub struct LearnerState {
                pub seed: u64,
            }
        "#;
        let fields = reachable_fields(&types_in(source));
        let corpus: BTreeSet<String> = ["seed".to_string()].into_iter().collect();
        assert!(uncovered_fields(&fields, &corpus).is_empty());
    }

    /// The same fixture against an empty corpus: the field is reachable and
    /// the key is nowhere, so it must be flagged, named.
    #[test]
    fn a_field_absent_from_the_corpus_is_flagged_by_name() {
        let source = r#"
            pub struct LearnerState {
                pub seed: u64,
            }
        "#;
        let fields = reachable_fields(&types_in(source));
        let missing = uncovered_fields(&fields, &BTreeSet::new());
        assert!(
            missing
                .iter()
                .any(|m| m.contains("LearnerState") && m.contains("seed")),
            "expected a violation naming LearnerState and seed, got: {missing:?}"
        );
    }

    /// **The evasion issue #33 names, reproduced.** A field renamed on the
    /// wire via `#[serde(rename = "topicIds")]` while the corpus still only
    /// ever wrote the old key `topics` — the walk must resolve the field to
    /// its *renamed* key, `topicIds`, and flag that no vector carries it,
    /// even though the old key `topics` is right there in the corpus.
    #[test]
    fn a_serde_renamed_field_is_checked_by_its_new_key_not_its_old_one() {
        let source = r#"
            pub struct LearnerState {
                #[serde(rename = "topicIds")]
                pub topics: Vec<String>,
            }
        "#;
        let fields = reachable_fields(&types_in(source));
        let corpus: BTreeSet<String> = ["topics".to_string()].into_iter().collect();
        let missing = uncovered_fields(&fields, &corpus);
        assert!(
            missing.iter().any(|m| m.contains("topicIds")),
            "expected the rename's new key topicIds to be flagged even though the old key \
             topics is in the corpus, got: {missing:?}"
        );
    }

    /// Named exclusion, reproduced directly: an enum variant on `EXCLUDED_VARIANTS`
    /// contributes no field and is not walked into, even though it is
    /// reachable from a root and even though its own field is otherwise
    /// uncovered.
    #[test]
    fn an_excluded_variant_is_never_flagged_and_never_walked_into() {
        let source = r#"
            pub enum Frame {
                Content(ContentFrame),
            }
            pub struct ContentFrame {
                pub band_words: Vec<String>,
            }
        "#;
        let types = types_in(source);
        let fields = reachable_fields(&types);
        let owners: Vec<&str> = fields.iter().map(|f| f.owner.as_str()).collect();
        assert!(
            fields.is_empty(),
            "Frame::Content is on EXCLUDED_VARIANTS and ContentFrame is only reachable through \
             it; expected nothing collected, got fields owned by: {owners:?}"
        );
    }
}
