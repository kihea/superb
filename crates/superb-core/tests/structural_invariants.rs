//! Law 6, turned into a parser (BRIEF-012): "invariants are structural, not
//! documentary" (`docs/engine-contract.md` §1). The law was written down
//! after two findings in two consecutive briefs, and a third occurrence —
//! `Tuning` itself, fourteen range checks bypassable with struct-update
//! syntax — landed the same day. **Writing a law down stops it being
//! forgotten; it does not stop it being violated.** This is the mechanism.
//!
//! Three checkable shapes, all read off the AST with `syn` rather than off
//! prose, matching `wire_roster.rs`'s own method (that file is the model and
//! the host for this one; its walk, its file-collection, and its
//! `impl_target_name` helper are duplicated here rather than shared, because
//! each file under `tests/` compiles as its own crate):
//!
//! 1. **A validated type's own fields must not be `pub`.** A type carrying
//!    an inherent method literally named `validate`, or a `validate*`-named
//!    method returning `Result<(), _>`, is presumed to have a validator a
//!    `pub` field lets a caller walk straight around — the `Tuning` shape.
//! 2. **A field pair written together must not be independently `pub`.** A
//!    type with an `&mut self` mutator taking two or more of its own fields
//!    as parameters — matched by parameter name against field name, the
//!    same way `WordRecord::set_due_and_interval` and
//!    `LearnerState::set_theta_and_se` are shaped — must not expose two or
//!    more of those matched fields as `pub`. `&mut self` specifically rules
//!    out a constructor like `fn new(..)`, which legitimately takes every
//!    field once by design and implies no ongoing togetherness invariant
//!    between any two of them — the false positive `WordRecord::new` and
//!    `LearnerState::new` produced against an earlier version of this
//!    check, before that distinction was drawn.
//! 3. **A validated type's own fields must not be reachable through a `&mut`
//!    accessor, either — from any impl block, inherent or trait.** A `&mut
//!    self` method — of any name at all, unlike clause 1's name-matched
//!    trigger — whose body's returned value (its tail expression, or an
//!    explicit `return`) is `&mut self.<field>` for one of the type's own
//!    fields hands out the same write access `pub` would, on a type clause 1
//!    already presumes carries an invariant. Added in this check's second
//!    round, closing the gap both the brief and the verifier predicted would
//!    be the next one attempted, because it *looks* encapsulated: a field
//!    kept genuinely private, with a `pub fn` next to it that returns `&mut`
//!    straight through. **Deliberately not restricted to inherent impls,
//!    unlike clauses 1 and 2.** `record_methods` records every method from
//!    every impl block, and this clause reads all of them, on purpose: a
//!    `DerefMut::deref_mut` or `IndexMut::index_mut` whose tail expression is
//!    `&mut self.<field>` is the exact same hazard as a hand-named `_mut()`
//!    accessor, in the exact idiom Rust itself uses for it — a trait cannot
//!    declare a method literally named `validate` or shaped like this
//!    crate's mutators (which is why clauses 1 and 2 stay inherent-only),
//!    but it can absolutely declare `&mut self -> &mut Field`, because that
//!    is what `DerefMut` and `IndexMut` *are*. This check's third round
//!    (BRIEF-012, round 3) found and closed the gap where an earlier version
//!    of this clause skipped every trait impl on the strength of a doc
//!    comment written for clauses 1 and 2 that did not hold for clause 3.
//!
//! **The guarantee this buys, stated exactly:** default-deny over
//! declaration-position `pub` fields and `&mut` field accessors — from any
//! impl block, inherent or trait — on a type this crate's own source shows
//! constructing an invariant across two or more fields, or behind an
//! explicit inherent validator. It catches all three violations that have
//! actually occurred (BRIEF-009, BRIEF-010, BRIEF-011, reconstructed as the
//! fixtures below) and three of the six evasions anyone has thought to try
//! (the `#![allow(...)]` module, the inherent `&mut` accessor closed in this
//! check's second round, and the trait-impl `&mut` accessor —
//! `DerefMut`/`IndexMut` — closed in this check's third round). It does not
//! enforce law 6 — a claim this file's own evasion tests below spend most of
//! their length refusing to make. **One trait-impl shape stays uncovered
//! after this round, named exactly:** a type whose *only* validate-shaped
//! method is itself declared inside a trait impl (a hand-written `impl
//! SomeTrait for X { fn validate(&self) -> Result<(), _> { .. } }`) never
//! sets `has_validate_method`, because clause 1's detection is inherent-only
//! by the same reasoning that keeps clause 1 itself inherent-only — and
//! clause 3 requires `has_validate_method` before it looks at any accessor
//! at all, so a `&mut` accessor on such a type, trait-impl or inherent,
//! would also go unchecked. This project's own validated types declare
//! `validate` inherently today, so the gap is theoretical against current
//! `src/`, but it is real and unclosed.
//!
//! **Blind spots inherited from `wire_roster.rs`, unchanged here:** the walk
//! descends into `mod { .. }` and nothing else, so a type or impl inside a
//! function body, a method body, or an anonymous `const _: () = { .. };` is
//! invisible. A `#[path = "..."]` module escapes the `src/` walk. A macro
//! that expands into a struct or impl this parser never sees is invisible
//! to it, by the same construction that made a hand-written `impl
//! Serialize` invisible to a line-scanner and not to this kind of parser.
//!
//! **Blind spots specific to this check, named because an understated one
//! is worse than a known one:**
//!
//! - Only named-field structs are inspected. A tuple struct (`Timestamp
//!   (u64)`) or a unit struct has no field name for a violation message to
//!   name, and carries none of this project's validated-type shapes today.
//! - Clause 1's trigger name is exactly what the brief specifies: `validate`
//!   verbatim, or a `validate`-prefixed name returning `Result<(), _>`. A
//!   validator named `check`, `ensure`, or `is_valid` is invisible to it —
//!   demonstrated, not assumed, below.
//! - Clause 2 matches a mutator's parameters to a type's fields **by name**,
//!   not by what the method body does with them — the walk does not descend
//!   into function bodies (see above). A mutator that writes two fields
//!   together but names its parameters differently from the fields
//!   (`fn set_due(&mut self, at: Timestamp, span: f64)` writing
//!   `due_epoch_ms` and `interval_days`) is invisible to it.
//! - Clause 3's own reach is narrow and shallow on purpose: it recognizes
//!   only a `&mut self` method whose *own* tail expression, or an explicit
//!   top-level `return`, is `&mut self.<field>` written directly. A field
//!   reference threaded through a local binding first (`let r = &mut
//!   self.theta; r`), returned from inside an `if`, `match`, or other nested
//!   branch, or handed out wrapped in something else (a tuple, a newtype)
//!   is invisible to it — this is a syntactic check for the exact shape
//!   demonstrated below, not a data-flow analysis of what a method body
//!   does with a reference once it has one. This holds identically whether
//!   the method lives in an inherent impl or a trait impl; the fix that
//!   made clause 3 look at trait impls at all (this check's third round)
//!   did not, and could not, widen this syntactic reach.
//! - Clause 3 still requires `has_validate_method`, which is computed from
//!   inherent methods only (see the item-3 note above and `record_methods`'s
//!   doc). A type whose only `validate`-shaped method is declared inside a
//!   trait impl is invisible to clause 1, and therefore also invisible to
//!   clause 3 — a `&mut` accessor on such a type, trait-impl or inherent,
//!   goes unchecked, because clause 3 never gets past its own
//!   `has_validate_method` gate. No type in this crate's `src/` is shaped
//!   this way today; the gap is named because it is real, not because it is
//!   exercised.
//! - A validated inner type nested inside an outer type whose own fields are
//!   `pub` is invisible to it when the outer type declares no validator of
//!   its own — a genuinely cross-type invariant has no single type's
//!   `validate` method for clause 1 to find. Demonstrated below.
//! - **`pub(crate)` fields are never flagged, on any clause — only `pub`.**
//!   The brief's own first draft of clause 1 also named "`pub(crate)` where
//!   the type is re-exported beyond the crate" as a trigger. That trigger
//!   was struck by the architect, not narrowed: re-exporting a type with
//!   `pub use` does not widen its fields' own declared visibility, so
//!   `pub(crate)` stays inaccessible from outside the crate regardless of
//!   where the type's name is reachable from, and there was never a hazard
//!   here for a mechanical rule to describe. `Tuning`'s own `pub(crate)`
//!   fields are exactly this shape, and are not a gap.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use syn::{Expr, FnArg, Item, ItemImpl, Member, Pat, ReturnType, Stmt, Type, Visibility};

/// Every `.rs` file under `dir`, walked recursively. Identical to
/// `wire_roster.rs`'s own helper of the same name; duplicated rather than
/// shared because `tests/*.rs` files each compile as an independent crate.
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

/// The simple name of the type a `impl ... for Target` or inherent
/// `impl Target` governs, ignoring any generic parameters on `Target`.
/// Identical in shape to `wire_roster.rs`'s `impl_target_name`.
fn impl_target_name(self_ty: &Type) -> Option<String> {
    match self_ty {
        Type::Path(type_path) => Some(type_path.path.segments.last()?.ident.to_string()),
        _ => None,
    }
}

/// One field a struct declares: its name, and whether it is `pub` — not
/// `pub(crate)`, not `pub(super)`, not `pub(in ...)`, only unrestricted
/// `pub` (see the module doc's last blind spot).
struct FieldInfo {
    name: String,
    is_pub: bool,
}

/// One named-field struct's fields, in declaration order.
struct TypeRecord {
    fields: Vec<FieldInfo>,
}

/// One inherent method: its name, the names of its own parameters that are
/// simple identifiers (a destructuring pattern contributes nothing, since it
/// names no single field), and whether it returns `Result<(), _>` for any
/// error type at all — matching the brief's `Result<(), impl Error>` by
/// shape rather than by that exact, unparseable-in-this-position spelling.
struct MethodRecord {
    name: String,
    param_names: Vec<String>,
    returns_unit_result: bool,
    /// Whether this method's receiver is `&mut self` (or `mut self`) —
    /// the shape a mutator takes and a constructor (`fn new(..)`, no
    /// receiver at all) does not. Clause 2 is about a value already built
    /// being written around its own mutator, not about the constructor
    /// that takes every field once by design — see the false positive this
    /// field exists to rule out, on `WordRecord::new` and
    /// `LearnerState::new`, in this file's own history.
    takes_mut_self: bool,
    /// Whether this method's receiver is specifically `&mut self` — a
    /// reference, not a by-value `mut self`. Clause 3 needs this narrower
    /// shape: only a `&mut Self` receiver can hand back a reference into a
    /// field that outlives the call, which is exactly what makes the
    /// accessor evasion work.
    takes_ref_mut_self: bool,
    /// The field name this method's own body returns a `&mut` reference to,
    /// by name alone — set only when the method's tail expression, or an
    /// explicit top-level `return`, is written as `&mut self.<field>`
    /// directly. See the module doc's note on clause 3's shallow, syntactic
    /// reach: anything less direct than this is not seen.
    mut_field_return: Option<String>,
    /// Whether this method was declared in a trait impl (`impl Trait for
    /// Target`) rather than an inherent impl (`impl Target`). Clauses 1 and
    /// 2 read this to stay inherent-only — a trait's method names and
    /// parameter shapes are fixed by the trait, so the name-matched
    /// `validate` trigger and the parameter-name-matched mutator trigger
    /// essentially cannot occur there. Clause 3 does **not** read this: a
    /// `&mut self` method whose tail expression is `&mut self.<field>` hands
    /// out the same write access regardless of which kind of impl block
    /// declares it — `DerefMut::deref_mut` and `IndexMut::index_mut` are
    /// that exact shape in real, idiomatic Rust, not a hypothetical one.
    is_trait_impl: bool,
}

/// `&mut self.<field>`'s field name, if `expr` is written exactly that way —
/// a mutable reference whose inner expression is a field access on `self`.
/// Any other shape (a reference to something else, a field access on
/// anything other than `self`, a tuple-indexed field) returns `None`.
fn self_mut_field_name(expr: &Expr) -> Option<String> {
    let Expr::Reference(reference) = expr else {
        return None;
    };
    reference.mutability?;
    let Expr::Field(field_expr) = reference.expr.as_ref() else {
        return None;
    };
    let Expr::Path(path) = field_expr.base.as_ref() else {
        return None;
    };
    if !path.path.is_ident("self") {
        return None;
    }
    match &field_expr.member {
        Member::Named(ident) => Some(ident.to_string()),
        Member::Unnamed(_) => None,
    }
}

/// The field name `block`'s own returned value names, under clause 3's
/// syntactic definition of "returned": an explicit top-level `return
/// &mut self.<field>;`, checked first because it can appear before the
/// block's end, or `&mut self.<field>` written as the block's own tail
/// expression (its last statement, with no trailing semicolon). Neither
/// case descends into nested blocks, `if`/`match` arms, or through a local
/// binding — see the module doc.
fn block_mut_field_return(block: &syn::Block) -> Option<String> {
    for stmt in &block.stmts {
        if let Stmt::Expr(Expr::Return(expr_return), _) = stmt {
            if let Some(inner) = &expr_return.expr {
                if let Some(field) = self_mut_field_name(inner) {
                    return Some(field);
                }
            }
        }
    }
    match block.stmts.last() {
        Some(Stmt::Expr(tail, None)) => self_mut_field_name(tail),
        _ => None,
    }
}

/// `true` if `sig` returns `Result<(), X>` for some `X` — a bare `Result`
/// path whose first generic argument is the unit type.
fn returns_unit_result(sig: &syn::Signature) -> bool {
    let ReturnType::Type(_, ty) = &sig.output else {
        return false;
    };
    let Type::Path(type_path) = ty.as_ref() else {
        return false;
    };
    let Some(last) = type_path.path.segments.last() else {
        return false;
    };
    if last.ident != "Result" {
        return false;
    }
    let syn::PathArguments::AngleBracketed(args) = &last.arguments else {
        return false;
    };
    matches!(
        args.args.first(),
        Some(syn::GenericArgument::Type(Type::Tuple(tuple))) if tuple.elems.is_empty()
    )
}

/// Every method `item_impl` declares, gathered onto `methods`, keyed by the
/// type the impl governs — **both** inherent (`impl Target { .. }`) and
/// trait (`impl Trait for Target { .. }`) impl blocks, unlike
/// `wire_roster.rs`'s own walk (which skips trait impls outright, because it
/// is hunting for `derive`-shaped serialization, a concern that genuinely
/// cannot live in a trait impl).
///
/// Clauses 1 and 2's triggers are name- and parameter-name-matched against
/// this crate's own ad hoc conventions (a method literally called
/// `validate`; a mutator whose parameters happen to be named after the
/// fields it writes) — a trait's method names and signatures are fixed by
/// the trait it implements, so those two shapes essentially cannot occur in
/// a trait impl, and clauses 1 and 2 stay scoped to inherent methods only
/// (`MethodRecord::is_trait_impl`, read at each call site below). Clause 3's
/// trigger is different in kind: it looks for a `&mut self` method whose own
/// tail expression is `&mut self.<field>`, a shape a trait method can carry
/// exactly as literally as an inherent one — `DerefMut::deref_mut` and
/// `IndexMut::index_mut` are that shape verbatim in real, idiomatic Rust.
/// Every method, from every impl block, is therefore recorded here; which
/// clauses read which subset is decided in `check_violations`, not here.
fn record_methods(item_impl: &ItemImpl, methods: &mut BTreeMap<String, Vec<MethodRecord>>) {
    let is_trait_impl = item_impl.trait_.is_some();
    let Some(type_name) = impl_target_name(&item_impl.self_ty) else {
        return;
    };
    let entry = methods.entry(type_name).or_default();
    for impl_item in &item_impl.items {
        if let syn::ImplItem::Fn(method) = impl_item {
            let param_names = method
                .sig
                .inputs
                .iter()
                .filter_map(|arg| match arg {
                    FnArg::Typed(pat_type) => match pat_type.pat.as_ref() {
                        Pat::Ident(pat_ident) => Some(pat_ident.ident.to_string()),
                        _ => None,
                    },
                    FnArg::Receiver(_) => None,
                })
                .collect();
            let takes_mut_self = matches!(
                method.sig.inputs.first(),
                Some(FnArg::Receiver(receiver)) if receiver.mutability.is_some()
            );
            let takes_ref_mut_self = matches!(
                method.sig.inputs.first(),
                Some(FnArg::Receiver(receiver))
                    if receiver.reference.is_some() && receiver.mutability.is_some()
            );
            let mut_field_return = takes_ref_mut_self
                .then(|| block_mut_field_return(&method.block))
                .flatten();
            entry.push(MethodRecord {
                name: method.sig.ident.to_string(),
                param_names,
                returns_unit_result: returns_unit_result(&method.sig),
                takes_mut_self,
                takes_ref_mut_self,
                mut_field_return,
                is_trait_impl,
            });
        }
    }
}

/// Walks `items`, recursing into inline `mod { .. }` blocks exactly as
/// `wire_roster.rs`'s `walk_items` does, and records every named-field
/// struct's fields and every inherent impl's methods.
fn walk_items(
    items: &[Item],
    types: &mut BTreeMap<String, TypeRecord>,
    methods: &mut BTreeMap<String, Vec<MethodRecord>>,
) {
    for item in items {
        match item {
            Item::Struct(item_struct) => {
                if let syn::Fields::Named(named) = &item_struct.fields {
                    let fields = named
                        .named
                        .iter()
                        .map(|field| FieldInfo {
                            name: field
                                .ident
                                .as_ref()
                                .expect("a named field has an ident")
                                .to_string(),
                            is_pub: matches!(field.vis, Visibility::Public(_)),
                        })
                        .collect();
                    types.insert(item_struct.ident.to_string(), TypeRecord { fields });
                }
            }
            Item::Impl(item_impl) => record_methods(item_impl, methods),
            Item::Mod(item_mod) => {
                if let Some((_, inner_items)) = &item_mod.content {
                    walk_items(inner_items, types, methods);
                }
            }
            _ => {}
        }
    }
}

/// Every law-6 violation `types` and `methods` together describe, each
/// message naming the type, the field or fields, and the law — never
/// "assertion failed" (the brief's own clause 5: the next person to hit
/// this is someone adding a legitimate field, and the message is the whole
/// user interface of this check).
fn check_violations(
    types: &BTreeMap<String, TypeRecord>,
    methods: &BTreeMap<String, Vec<MethodRecord>>,
) -> Vec<String> {
    let mut violations = Vec::new();

    for (type_name, type_methods) in methods {
        let Some(type_record) = types.get(type_name) else {
            continue;
        };

        // Clause 1: a validate-shaped method, plus any `pub` field at all.
        // Inherent methods only — see `record_methods`'s doc for why a
        // trait impl essentially cannot carry this shape.
        let has_validate_method = type_methods.iter().filter(|m| !m.is_trait_impl).any(|m| {
            m.name == "validate" || (m.name.starts_with("validate") && m.returns_unit_result)
        });
        if has_validate_method {
            for field in &type_record.fields {
                if field.is_pub {
                    violations.push(format!(
                        "{type_name}::{} is `pub`, but {type_name} declares a `validate`-shaped \
                         method — engine-contract §1 law 6: a value whose validity is maintained \
                         by a function must not be writable around that function.",
                        field.name
                    ));
                }
            }
        }

        // Clause 2: a mutator — `&mut self`, ruling out a constructor like
        // `fn new(..)` that legitimately takes every field once — taking
        // two or more of the type's own fields (matched by parameter name),
        // where two or more of those matched fields are `pub`. Inherent
        // methods only, for the same reason clause 1 is: a trait method's
        // parameter names are fixed by the trait it implements, not chosen
        // to match this crate's field names.
        for method in type_methods
            .iter()
            .filter(|m| m.takes_mut_self && !m.is_trait_impl)
        {
            let matched: Vec<&FieldInfo> = type_record
                .fields
                .iter()
                .filter(|field| method.param_names.contains(&field.name))
                .collect();
            let pub_matched: Vec<&str> = matched
                .iter()
                .filter(|field| field.is_pub)
                .map(|field| field.name.as_str())
                .collect();
            if matched.len() >= 2 && pub_matched.len() >= 2 {
                violations.push(format!(
                    "{type_name}::{{{}}} are `pub`, but {type_name}::{} writes them together — \
                     engine-contract §1 law 6: two fields that must change together must not \
                     each be independently writable.",
                    pub_matched.join(", "),
                    method.name
                ));
            }
        }

        // Clause 3: a validate-shaped method, plus a `&mut self` accessor —
        // of any name, and from **any impl block, inherent or trait** —
        // whose own returned value is `&mut` to one of the type's own
        // fields. The field need not itself be `pub`; the accessor hands
        // out the same write access `pub` would, which is the point of the
        // evasion. Unlike clauses 1 and 2 above, this loop does not filter
        // on `is_trait_impl`: a trait can hand out `&mut` to a private field
        // exactly as an inherent method can (`DerefMut::deref_mut`,
        // `IndexMut::index_mut` are that shape verbatim), so every method
        // recorded for this type — trait impl or inherent — is checked.
        if has_validate_method {
            for method in type_methods.iter().filter(|m| m.takes_ref_mut_self) {
                let Some(field_name) = &method.mut_field_return else {
                    continue;
                };
                if type_record.fields.iter().any(|f| &f.name == field_name) {
                    violations.push(format!(
                        "{type_name}::{} returns `&mut` to {type_name}::{field_name}, but \
                         {type_name} declares a `validate`-shaped method — engine-contract §1 \
                         law 6: a value whose validity is maintained by a function must not be \
                         writable around that function, including through a `&mut` accessor.",
                        method.name
                    ));
                }
            }
        }
    }

    violations.sort();
    violations.dedup();
    violations
}

/// Parses `source` as one standalone file and returns every violation
/// `check_violations` finds in it — the entry point every fixture and
/// evasion test below shares.
fn violations_in_source(source: &str) -> Vec<String> {
    let parsed = syn::parse_file(source).expect("fixture source parses as Rust");
    let mut types = BTreeMap::new();
    let mut methods = BTreeMap::new();
    walk_items(&parsed.items, &mut types, &mut methods);
    check_violations(&types, &methods)
}

/// The check, run against `superb-core`'s real source. `Tuning`
/// (`pub(crate)` fields, a `validate` method) and `WordRecord` /
/// `LearnerState` (private fields, one mutator apiece taking both) are the
/// positive examples this must not flag.
#[test]
fn superb_core_source_has_no_structural_invariant_violations() {
    let crate_root = Path::new(env!("CARGO_MANIFEST_DIR"));

    let mut source_files = Vec::new();
    collect_rs_files(&crate_root.join("src"), &mut source_files);
    source_files.sort();
    assert!(!source_files.is_empty(), "src/ has no .rs files to check");

    let mut types = BTreeMap::new();
    let mut methods = BTreeMap::new();
    for file in &source_files {
        let source =
            fs::read_to_string(file).unwrap_or_else(|e| panic!("read {}: {e}", file.display()));
        let parsed = syn::parse_file(&source)
            .unwrap_or_else(|e| panic!("{} does not parse as Rust: {e}", file.display()));
        walk_items(&parsed.items, &mut types, &mut methods);
    }

    let violations = check_violations(&types, &methods);
    assert!(
        violations.is_empty(),
        "engine-contract §1 law 6 violated under src/ (default-deny over declaration-position \
         items in this crate's own source):\n{}",
        violations.join("\n")
    );
}

mod historical_violations {
    //! **The three historical violations are the test corpus** (the
    //! brief's clause 3). Each is reconstructed here from
    //! `workspace/briefs/_postmortem.md`'s own words — "public
    //! `due_epoch_ms` + `interval_days`", "public `theta` + `theta_se`",
    //! "public `Tuning` fields" — as a fixture the check is run against
    //! directly, never against code that already passes.

    use super::violations_in_source;

    /// BRIEF-009: `WordRecord`'s `due_epoch_ms` and `interval_days`, public,
    /// with `set_due_and_interval` writing both — the shape the postmortem
    /// records the verifier defeated with `record.due_epoch_ms = x;` alone.
    const BRIEF_009_SHAPE: &str = r#"
        pub struct WordRecord {
            pub due_epoch_ms: u64,
            pub interval_days: f64,
        }

        impl WordRecord {
            pub fn set_due_and_interval(&mut self, due_epoch_ms: u64, interval_days: f64) {
                self.due_epoch_ms = due_epoch_ms;
                self.interval_days = interval_days;
            }
        }
    "#;

    #[test]
    fn catches_the_brief_009_shape() {
        let violations = violations_in_source(BRIEF_009_SHAPE);
        assert!(
            violations.iter().any(|v| v.contains("WordRecord")
                && v.contains("due_epoch_ms")
                && v.contains("interval_days")),
            "expected a violation naming WordRecord, due_epoch_ms and interval_days, got: \
             {violations:?}"
        );
    }

    /// BRIEF-010: `LearnerState`'s `theta` and `theta_se`, public, with
    /// `set_theta_and_se` writing both — the shape a `pub` field let a
    /// caller clamp-bypass with `state.theta = 500.0;`.
    const BRIEF_010_SHAPE: &str = r#"
        pub struct LearnerState {
            pub theta: f64,
            pub theta_se: f64,
        }

        impl LearnerState {
            pub fn set_theta_and_se(&mut self, theta: f64, theta_se: f64) {
                self.theta = theta;
                self.theta_se = theta_se;
            }
        }
    "#;

    #[test]
    fn catches_the_brief_010_shape() {
        let violations = violations_in_source(BRIEF_010_SHAPE);
        assert!(
            violations.iter().any(|v| v.contains("LearnerState")
                && v.contains("theta")
                && v.contains("theta_se")),
            "expected a violation naming LearnerState, theta and theta_se, got: {violations:?}"
        );
    }

    /// BRIEF-011: a whole `Tuning`, every field public, constructable
    /// around its own `validate` with struct-update syntax — the shape
    /// that defeated fourteen range checks each of which had a passing
    /// test proving it fires.
    const BRIEF_011_SHAPE: &str = r#"
        pub struct Tuning {
            pub theta_min: f64,
            pub theta_max: f64,
            pub pseudoword_penalty: f64,
        }

        impl Tuning {
            pub fn validate(&self) -> Result<(), String> {
                if self.theta_min >= self.theta_max {
                    return Err("theta_min is not strictly less than theta_max".to_string());
                }
                if self.pseudoword_penalty <= 0.0 {
                    return Err("pseudoword_penalty is not strictly positive".to_string());
                }
                Ok(())
            }
        }
    "#;

    #[test]
    fn catches_the_brief_011_shape() {
        let violations = violations_in_source(BRIEF_011_SHAPE);
        assert!(
            violations
                .iter()
                .any(|v| v.contains("Tuning") && v.contains("theta_min")),
            "expected a violation naming Tuning and theta_min, got: {violations:?}"
        );
        assert!(
            violations
                .iter()
                .any(|v| v.contains("Tuning") && v.contains("theta_max")),
            "expected a violation naming Tuning and theta_max, got: {violations:?}"
        );
        assert!(
            violations
                .iter()
                .any(|v| v.contains("Tuning") && v.contains("pseudoword_penalty")),
            "expected a violation naming Tuning and pseudoword_penalty, got: {violations:?}"
        );
    }

    /// Clause 5: the message names the type, the field, and the law — the
    /// exact three things someone adding a legitimate field needs to read,
    /// not "assertion failed".
    #[test]
    fn failure_messages_name_the_type_the_field_and_the_law() {
        for source in [BRIEF_009_SHAPE, BRIEF_010_SHAPE, BRIEF_011_SHAPE] {
            let violations = violations_in_source(source);
            assert!(!violations.is_empty());
            for message in &violations {
                assert!(
                    message.contains("law 6"),
                    "message does not name the law: {message}"
                );
                assert_ne!(
                    message, "assertion failed",
                    "message is not self-explanatory"
                );
            }
        }
    }
}

mod evasions {
    //! The brief names three evasions and requires them demonstrated before
    //! the verifier sees them (clause 4); the verifier is briefed to spend
    //! most of its time trying a fourth and fifth, and independently found a
    //! sixth (a trait-impl `&mut` accessor — `DerefMut`/`IndexMut` — that
    //! the second round's fix for the fifth did not actually cover, because
    //! it reused a trait-impl skip written for a different clause). This
    //! third round closes the sixth and adds `IndexMut` as a seventh,
    //! same-shape fixture rather than leave the class demonstrated only
    //! once. All seven are here, each with its outcome stated in its own doc
    //! comment rather than left for someone to infer from whether the
    //! `assert!` reads `is_empty` or `!is_empty`.

    use super::violations_in_source;

    /// Named evasion 1: "a field made public through a `pub use` re-export
    /// rather than on the declaration."
    ///
    /// **Caught — because it does not work.** A `pub use` re-exports the
    /// *type*; it cannot change a field's own declared visibility, and
    /// Rust's privacy rules are checked against that declaration alone.
    /// `Widget { due_epoch_ms: 1, .. }` from outside `inner` fails to
    /// compile whether or not `pub use inner::Widget;` exists. This check
    /// reads each field's own `syn::Visibility` directly, never a proxy
    /// like "is the type's name reachable from a `pub use`" — so it was
    /// never exposed to this evasion in the first place. Demonstrated to
    /// show that, not to assume it.
    const PUB_USE_REEXPORT_EVASION: &str = r#"
        mod inner {
            pub struct Widget {
                due_epoch_ms: u64,
                interval_days: f64,
            }

            impl Widget {
                pub fn set_due_and_interval(&mut self, due_epoch_ms: u64, interval_days: f64) {
                    self.due_epoch_ms = due_epoch_ms;
                    self.interval_days = interval_days;
                }
            }
        }

        pub use inner::Widget;
    "#;

    #[test]
    fn pub_use_re_export_does_not_widen_a_fields_own_visibility() {
        let violations = violations_in_source(PUB_USE_REEXPORT_EVASION);
        assert!(
            violations.is_empty(),
            "expected no violation (the fields stay genuinely private), got: {violations:?}"
        );
    }

    /// Named evasion 2: "a validated type nested inside another type whose
    /// own fields are public."
    ///
    /// **Not caught.** `Inner` is compliant on its own — no `pub` field, so
    /// clause 1 never fires on it. `Outer` makes `inner` itself `pub`, and
    /// declares no `validate` of its own, so clause 1 has nothing to check
    /// it against either. A caller cannot construct an *invalid* `Inner`
    /// through `Outer` — `Inner`'s own privacy still gates that — but a
    /// genuinely cross-type invariant (one that needs `Outer`'s own field
    /// and `Inner`'s field together) has no single type's `validate` for
    /// this check to find, and would be invisible to it.
    const NESTED_VALIDATED_TYPE_EVASION: &str = r#"
        pub struct Inner {
            threshold: f64,
        }

        impl Inner {
            pub fn validate(&self) -> Result<(), String> {
                if self.threshold > 0.0 {
                    Ok(())
                } else {
                    Err("threshold must be positive".to_string())
                }
            }
        }

        pub struct Outer {
            pub inner: Inner,
            pub label: String,
        }
    "#;

    #[test]
    fn a_validated_type_nested_in_a_type_with_public_fields_is_not_caught() {
        let violations = violations_in_source(NESTED_VALIDATED_TYPE_EVASION);
        assert!(
            violations.is_empty(),
            "expected this evasion to go undetected (a known blind spot), but it was caught: \
             {violations:?}"
        );
    }

    /// Named evasion 3: "a `validate` method named something else —
    /// `check`, `ensure`, `is_valid`."
    ///
    /// **Not caught, by the brief's own scoping.** Clause 1 triggers on a
    /// method literally named `validate`, or `validate*` returning
    /// `Result<(), _>` — the brief named the trigger name, not a synonym
    /// list. `ensure` matches neither, so `Config`'s two `pub` fields
    /// (which a real validator would need to keep ordered) are invisible.
    const RENAMED_VALIDATE_EVASION: &str = r#"
        pub struct Config {
            pub theta_min: f64,
            pub theta_max: f64,
        }

        impl Config {
            pub fn ensure(&self) -> Result<(), String> {
                if self.theta_min < self.theta_max {
                    Ok(())
                } else {
                    Err("theta_min is not strictly less than theta_max".to_string())
                }
            }
        }
    "#;

    #[test]
    fn a_validate_method_renamed_ensure_is_not_caught() {
        let violations = violations_in_source(RENAMED_VALIDATE_EVASION);
        assert!(
            violations.is_empty(),
            "expected this evasion to go undetected (a known blind spot), but it was caught: \
             {violations:?}"
        );
    }

    /// Verifier-named evasion 4: "a validated type inside a module with
    /// `#![allow(...)]`."
    ///
    /// **Caught — unaffected.** This check never reads a lint attribute of
    /// any kind; it reads field visibility and method signatures off the
    /// AST directly. A `#![allow(dead_code)]` at the top of the file
    /// changes nothing this check looks at.
    const ALLOW_ATTRIBUTE_MODULE_EVASION: &str = r#"
        #![allow(dead_code)]

        pub struct Bounds {
            pub theta_min: f64,
            pub theta_max: f64,
        }

        impl Bounds {
            pub fn validate(&self) -> Result<(), String> {
                if self.theta_min < self.theta_max {
                    Ok(())
                } else {
                    Err("theta_min is not strictly less than theta_max".to_string())
                }
            }
        }
    "#;

    #[test]
    fn an_allow_attribute_does_not_blind_the_check() {
        let violations = violations_in_source(ALLOW_ATTRIBUTE_MODULE_EVASION);
        assert!(
            violations.iter().any(|v| v.contains("Bounds")),
            "expected a violation naming Bounds, got: {violations:?}"
        );
    }

    /// Verifier-named evasion 5: "a field made writable through a `&mut`
    /// accessor rather than public visibility" — flagged by the brief as
    /// the shape most likely to appear next, "because it *looks*
    /// encapsulated," and independently flagged by the verifier as the one
    /// most worth spending time on.
    ///
    /// **Caught, as of this check's second round.** `theta` is genuinely
    /// private — clause 1 sees no `pub` field and stays silent on its own.
    /// But `theta_mut` hands out `&mut f64` straight to the private field as
    /// its own tail expression, and `*calibration.theta_mut() = 999.0;`
    /// would compile and never call `validate` again. Clause 3 reads
    /// exactly that shape — a `&mut self` method whose own returned value is
    /// `&mut self.<field>` — and flags it on any validate-bearing type,
    /// under any accessor name. See the module doc for how shallow this
    /// reach still is: a value threaded through a local first, or returned
    /// from inside a nested branch, is not this fixture, and is not caught.
    const MUT_ACCESSOR_EVASION: &str = r#"
        pub struct Calibration {
            theta: f64,
        }

        impl Calibration {
            pub fn validate(&self) -> Result<(), String> {
                if self.theta.is_finite() {
                    Ok(())
                } else {
                    Err("theta must be finite".to_string())
                }
            }

            pub fn theta_mut(&mut self) -> &mut f64 {
                &mut self.theta
            }
        }
    "#;

    #[test]
    fn a_mut_accessor_to_a_validated_types_field_is_caught() {
        let violations = violations_in_source(MUT_ACCESSOR_EVASION);
        assert!(
            violations.iter().any(|v| v.contains("Calibration")
                && v.contains("theta_mut")
                && v.contains("theta")),
            "expected a violation naming Calibration, theta_mut and theta, got: {violations:?}"
        );
    }

    /// Verifier-named evasion 6 (this check's third round): `impl DerefMut
    /// for Calibration { fn deref_mut(&mut self) -> &mut f64 { &mut
    /// self.theta } }` — the same evasion 5 shape, on a private `theta`, but
    /// written as a trait impl instead of a hand-named `_mut()` method.
    ///
    /// **Not caught before this round.** `record_inherent_methods` (this
    /// check's second-round name for what is now `record_methods`) opened
    /// with `if item_impl.trait_.is_some() { return; }`, on the strength of
    /// a doc comment that was true for clauses 1 and 2 and false for clause
    /// 3: `deref_mut`'s tail expression is `&mut self.theta`, exactly
    /// clause 3's trigger shape, and a trait impl can carry it exactly as
    /// literally as an inherent method can. The verifier compiled this
    /// shape against the check's own logic and got zero violations, and
    /// `*calibration = 999.0;` would compile and never call `validate`
    /// again.
    ///
    /// **Caught now.** `record_methods` records every impl block, trait or
    /// inherent, and clause 3 reads all of them (see the module doc's item-3
    /// note and `record_methods`'s own doc for why clauses 1 and 2 stay
    /// inherent-only while clause 3 does not).
    const DEREF_MUT_EVASION: &str = r#"
        pub struct Calibration {
            theta: f64,
        }

        impl Calibration {
            pub fn validate(&self) -> Result<(), String> {
                if self.theta.is_finite() {
                    Ok(())
                } else {
                    Err("theta must be finite".to_string())
                }
            }
        }

        impl std::ops::DerefMut for Calibration {
            fn deref_mut(&mut self) -> &mut f64 {
                &mut self.theta
            }
        }
    "#;

    #[test]
    fn a_derefmut_impl_exposing_a_validated_types_field_is_caught() {
        let violations = violations_in_source(DEREF_MUT_EVASION);
        assert!(
            violations.iter().any(|v| v.contains("Calibration")
                && v.contains("deref_mut")
                && v.contains("theta")),
            "expected a violation naming Calibration, deref_mut and theta, got: {violations:?}"
        );
    }

    /// Evasion 7 (this check's third round, added alongside 6 rather than
    /// leaving the trait-impl class demonstrated only once): `impl IndexMut
    /// for Calibration { fn index_mut(&mut self, _: usize) -> &mut f64 {
    /// &mut self.theta } }` — the same shape, a different standard trait.
    ///
    /// **Caught**, by the same fix as evasion 6: `index_mut`'s tail
    /// expression is `&mut self.theta`, and clause 3 now reads trait-impl
    /// methods as readily as inherent ones.
    const INDEX_MUT_EVASION: &str = r#"
        pub struct Calibration {
            theta: f64,
        }

        impl Calibration {
            pub fn validate(&self) -> Result<(), String> {
                if self.theta.is_finite() {
                    Ok(())
                } else {
                    Err("theta must be finite".to_string())
                }
            }
        }

        impl std::ops::IndexMut<usize> for Calibration {
            fn index_mut(&mut self, _index: usize) -> &mut f64 {
                &mut self.theta
            }
        }
    "#;

    #[test]
    fn an_indexmut_impl_exposing_a_validated_types_field_is_caught() {
        let violations = violations_in_source(INDEX_MUT_EVASION);
        assert!(
            violations.iter().any(|v| v.contains("Calibration")
                && v.contains("index_mut")
                && v.contains("theta")),
            "expected a violation naming Calibration, index_mut and theta, got: {violations:?}"
        );
    }
}
