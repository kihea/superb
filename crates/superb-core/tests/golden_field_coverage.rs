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
//! struct is `{ initial_state: LearnerState, now: u64, request: Option<_>,
//! event: Option<Event>, frame: Frame }`, and the file it replays is that
//! header plus a `Vec<Effect>`. `LearnerState`, `Event`, `Frame` and `Effect`
//! are the four types a golden vector's bytes are made of, so they are the
//! roots — not the wire roster's full type list, which also covers
//! `Tuning`/`Affinity`/`PoolAffinity` (pinned by `tuning.toml`'s own
//! round-trip test, never by a golden vector) and boundary types like
//! `Needs`/`Request` that only `plan()` touches, never the committed vector
//! bytes. Reusing the roster's enumeration wholesale would flag those as
//! "uncovered" for a reason that has nothing to do with this property — a
//! false alarm on day one is how a check earns the right to be ignored on
//! day thirty.
//!
//! **ADR-030 closed the composer subtree; there is no exclusion left to
//! name.** PR #70 shipped this file with two named exclusions,
//! `("Frame", "Content")` and `("Effect", "PassageComposed")`, because
//! `golden_vectors.rs::regenerate` only ever constructed
//! `Request::ProcessEvent` — `Effect::PassageComposed` is `decide()`'s
//! response to `Request::NextPassage` and nothing else, so the whole
//! subtree under it (`Passage`, `SlotFill`) and under `Frame::Content`
//! (`ContentFrame`, `Candidate`, `Slot`, `Pool`) was structurally
//! unreachable by the harness as written, not merely uncovered.
//! `golden_vectors.rs` now supports a `NextPassage` header (ADR-030
//! Decision 1) and `tests/golden/asking_for_the_next_passage_composes_and_fills_a_due_word.jsonl`
//! exercises it, computed by actually running `compose` rather than
//! hand-typed. `EXCLUDED_VARIANTS` is kept, empty, as the mechanism rather
//! than deleted outright — the shape stays available the day some future
//! subtree needs the same honest deadline this one just met. The staleness
//! test that watched the old exclusion (`the_passage_composed_exclusion_is_still_true_of_golden_vectors_rs`,
//! PR #70) is gone: its entire premise was that `golden_vectors.rs` must
//! never mention `NextPassage`, which is now permanently false by design, so
//! keeping it would mean shipping a test that can never pass again. Its job
//! — noticing the moment the assumption broke — is done; the moment is
//! this commit.
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
//! spelling would cover each other by coincidence. This is the same class of
//! blind spot `wire_roster.rs` and `structural_invariants.rs` both name in
//! their own doc comments rather than pretend past, and the issue's own
//! discharge text asks for exactly this membership shape ("fail with the
//! names of any field that appears in none").
//!
//! **A type name is unique across the walked source, checked rather than
//! assumed, and this is new since PR #70's review (finding I-2).** PR #70's
//! `types: BTreeMap<String, TypeShape>` was keyed on bare identifier and
//! populated by unconditional overwrite — a second, unrelated type anywhere
//! in `src/` sharing a name with one of the four roots silently substituted
//! its shape for the real one, turning a confirmed rename violation
//! false-green with no adversary required (a harmless helper type was
//! enough). `record_type` below panics the moment a second declaration of a
//! name is seen, naming both files — collision is a build failure for this
//! check, not a silent substitution. `wire_roster.rs` solved the analogous
//! cross-*crate* problem by keying on `(crate, type)`; the within-crate
//! version doesn't need a compound key, because there is exactly one crate
//! here and "unique bare name" is already the property Rust's own `use`
//! resolution would insist on the moment two same-named public items were
//! ever imported into the same scope — this check now insists on it too,
//! earlier and with a clearer message.
//!
//! **Other named blind spots**, inherited from `wire_roster.rs`'s method: the
//! walk descends into `mod {}` and nothing else. Only named fields
//! contribute a field to check; a fieldless enum (`WordState`) contributes
//! none of its own, though a field *of* one is still checked. A tuple
//! variant or tuple struct's own wrapped type **is** walked into (unlike PR
//! #70's version, per `FieldsKind::Transparent`) so its own named fields are
//! reached and checked; the wrapper contributes no field of its own, since a
//! positional field has no name to check.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use syn::{Fields, GenericArgument, Item, PathArguments, Type};

/// Enum variant, by (enclosing type, variant name), that this file's walk
/// would skip rather than reach — see the module doc: empty since ADR-030,
/// kept as the mechanism rather than removed.
const EXCLUDED_VARIANTS: [(&str, &str); 0] = [];

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

/// One item's own fields, in the shape that matters to this file: named
/// fields carry a JSON key each and are what the coverage check inspects;
/// unnamed (tuple) fields carry no name to check but their types are still
/// walked into, so a tuple variant like `Frame::Content(ContentFrame)`
/// reaches `ContentFrame`'s own named fields; a unit shape contributes
/// nothing either way.
enum FieldsKind {
    Named(Vec<(String, Type)>),
    Transparent(Vec<Type>),
    None,
}

fn fields_kind(fields: &Fields) -> FieldsKind {
    match fields {
        Fields::Named(named) => FieldsKind::Named(
            named
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
        ),
        Fields::Unnamed(unnamed) => {
            FieldsKind::Transparent(unnamed.unnamed.iter().map(|f| f.ty.clone()).collect())
        }
        Fields::Unit => FieldsKind::None,
    }
}

/// One type's shape, exactly as much of it as this file needs: for a
/// struct, its own fields; for an enum, each variant's name and fields.
enum TypeShape {
    Struct(FieldsKind),
    Enum(Vec<(String, FieldsKind)>),
}

/// A recorded type: its shape, and the file it was declared in — the file is
/// carried only so a collision (`record_type`) can name both declarations.
struct TypeEntry {
    origin: PathBuf,
    shape: TypeShape,
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

/// Records `name` -> `shape`, declared in `origin`, and panics the moment a
/// second declaration of the same bare name is seen anywhere in the walked
/// source — see the module doc's "A type name is unique" (finding I-2).
/// A collision is a build failure for this check: the alternative is the
/// second type silently substituting for the first in every field-coverage
/// answer, which is what PR #70 shipped and what a decoy `enum Frame`
/// dropped anywhere in `src/` defeated with no adversary required.
fn record_type(
    types: &mut BTreeMap<String, TypeEntry>,
    name: String,
    shape: TypeShape,
    origin: &Path,
) {
    if let Some(existing) = types.get(&name) {
        panic!(
            "{name} is declared more than once under src/: first in {}, again in {} — this \
             file's coverage check is keyed on bare type name (module doc, \"A type name is \
             unique\"), so a second type sharing a name anywhere in the crate would silently \
             substitute its shape for the real one and blind the check to real drift on \
             whichever declaration this walk visits second. Rename one of the two.",
            existing.origin.display(),
            origin.display()
        );
    }
    types.insert(
        name,
        TypeEntry {
            origin: origin.to_path_buf(),
            shape,
        },
    );
}

/// Walks `items`, recursing into inline `mod {}` blocks, recording every
/// struct and every enum (variant-by-variant) it finds, `origin` naming the
/// file a collision message should point at.
fn walk_items(items: &[Item], types: &mut BTreeMap<String, TypeEntry>, origin: &Path) {
    for item in items {
        match item {
            Item::Struct(item_struct) => {
                record_type(
                    types,
                    item_struct.ident.to_string(),
                    TypeShape::Struct(fields_kind(&item_struct.fields)),
                    origin,
                );
            }
            Item::Enum(item_enum) => {
                let variants = item_enum
                    .variants
                    .iter()
                    .map(|variant| (variant.ident.to_string(), fields_kind(&variant.fields)))
                    .collect();
                record_type(
                    types,
                    item_enum.ident.to_string(),
                    TypeShape::Enum(variants),
                    origin,
                );
            }
            Item::Mod(item_mod) => {
                if let Some((_, inner_items)) = &item_mod.content {
                    walk_items(inner_items, types, origin);
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

/// Breadth-first from `ROOTS`, skipping `EXCLUDED_VARIANTS` (empty since
/// ADR-030), collecting every named field this file's scope reaches and
/// following every tuple field's type without collecting a field for it.
fn reachable_fields(types: &BTreeMap<String, TypeEntry>) -> Vec<FieldRef> {
    let mut fields = Vec::new();
    let mut visited: BTreeSet<String> = BTreeSet::new();
    let mut frontier: Vec<String> = ROOTS.iter().map(|s| s.to_string()).collect();

    while let Some(type_name) = frontier.pop() {
        if !visited.insert(type_name.clone()) {
            continue;
        }
        let Some(entry) = types.get(&type_name) else {
            continue; // a leaf: foreign, primitive, or a name this file never saw declared.
        };

        // (owner, Some(json_key) for a named field to check, ty to recurse into)
        let mut owned: Vec<(String, Option<String>, Type)> = Vec::new();
        let push_kind =
            |owner: String, kind: &FieldsKind, owned: &mut Vec<(String, Option<String>, Type)>| {
                match kind {
                    FieldsKind::Named(named) => {
                        for (json_key, ty) in named {
                            owned.push((owner.clone(), Some(json_key.clone()), ty.clone()));
                        }
                    }
                    FieldsKind::Transparent(tys) => {
                        for ty in tys {
                            owned.push((owner.clone(), None, ty.clone()));
                        }
                    }
                    FieldsKind::None => {}
                }
            };

        match &entry.shape {
            TypeShape::Struct(kind) => push_kind(type_name.clone(), kind, &mut owned),
            TypeShape::Enum(variants) => {
                for (variant_name, kind) in variants {
                    if EXCLUDED_VARIANTS.contains(&(type_name.as_str(), variant_name.as_str())) {
                        continue;
                    }
                    push_kind(format!("{type_name}::{variant_name}"), kind, &mut owned);
                }
            }
        }

        for (owner, json_key, ty) in owned {
            let mut referenced = Vec::new();
            referenced_type_names(&ty, &mut referenced);
            for name in referenced {
                if !visited.contains(&name) {
                    frontier.push(name);
                }
            }
            if let Some(json_key) = json_key {
                fields.push(FieldRef {
                    owner,
                    json_key,
                    ty,
                });
            }
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
        walk_items(&parsed.items, &mut types, file);
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

mod fixtures {
    //! The standing rule (issue #32's own citation of it): a check whose
    //! outcome is an enforcement mechanism demonstrates the evasion it
    //! closes. These run the real walk and the real corpus-membership logic
    //! against small embedded sources and hand-built corpora, the same
    //! pattern `structural_invariants.rs`'s own fixture tests use, so the
    //! demonstration is permanent rather than a scratch commit that only
    //! ever ran once.

    use super::*;

    /// One fixture "file" — `types_in` and `types_in_files` label every type
    /// they record with this path, so a collision fixture (below) can prove
    /// the panic message names two distinct declarations, matching how a
    /// real cross-file collision (PR #70's review, finding I-2) is found.
    fn types_in(source: &str) -> BTreeMap<String, TypeEntry> {
        types_in_files(&[("<fixture>", source)])
    }

    /// Several fixture "files," each walked under its own path — this is
    /// what lets a fixture reproduce a same-name collision declared in two
    /// different files, the exact shape the verifier's own decoy used
    /// (`state.rs` shadowing `engine.rs`'s real `Frame`).
    fn types_in_files(files: &[(&str, &str)]) -> BTreeMap<String, TypeEntry> {
        let mut types = BTreeMap::new();
        for (path, source) in files {
            let parsed = syn::parse_file(source).expect("fixture source parses as Rust");
            walk_items(&parsed.items, &mut types, Path::new(path));
        }
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

    /// **New since ADR-030.** A tuple variant's wrapped type is walked into:
    /// `Frame::Content(ContentFrame)` contributes no field of its own (a
    /// positional field has no name to check) but `ContentFrame`'s own
    /// named field, `band_words`, is reachable through it and is checked —
    /// this is the capability that closes the composer subtree.
    #[test]
    fn a_tuple_variants_wrapped_type_is_walked_into() {
        let source = r#"
            pub enum Frame {
                Content(ContentFrame),
            }
            pub struct ContentFrame {
                pub band_words: Vec<String>,
            }
        "#;
        let fields = reachable_fields(&types_in(source));
        assert!(
            fields
                .iter()
                .any(|f| f.owner == "ContentFrame" && f.json_key == "band_words"),
            "expected ContentFrame::band_words to be reached through the tuple variant \
             Frame::Content, found owners: {:?}",
            fields.iter().map(|f| f.owner.as_str()).collect::<Vec<_>>()
        );
    }

    /// **The evasion PR #70's review found (finding I-2), reproduced
    /// exactly.** Two files each declare a type named `Frame` — the real one
    /// (a struct with a field this fixture's corpus does not cover) and an
    /// unrelated, harmless-looking decoy (the verifier's own example: a
    /// bare enum with one variant, dropped in a file that sorts after the
    /// real one). Before this fix, the decoy's shape silently overwrote the
    /// real one in the type registry and the real field's violation vanished
    /// — this test proves that can no longer happen: recording the second
    /// declaration panics, naming both files, rather than proceeding on
    /// whichever shape happened to be recorded last.
    #[should_panic(expected = "Frame is declared more than once under src/")]
    #[test]
    fn a_same_named_type_in_a_second_file_panics_instead_of_silently_substituting() {
        let real = ("engine.rs", "pub struct Frame { pub topics: Vec<String> }");
        let decoy = ("state.rs", "pub enum Frame { Decoy }");
        types_in_files(&[real, decoy]);
    }
}
