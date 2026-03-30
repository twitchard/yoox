# Synthesis: Comparing the Four Approaches

## The Pipeline (common to all)

All four approaches share the same pipeline. They differ in what they emphasize and how they represent intermediate artifacts:

```
Traces ──→ Data Model ──→ Abstract Application ──→ Widget Assembly ──→ Rendered Product
  (1)         (2)              (3)                    (4)                (5)
```

## What Each Approach Contributes

| Phase | A (Constraints) | B (LTS) | C (Types) | D (Sketches) |
|---|---|---|---|---|
| 1. Traces → | Prolog facts | Paths through LTS | Typing judgments | Spec for solver |
| 2. Data Model | Inferred by rules | States of LTS | Data sort | Part of sketch |
| 3. Abstract App | Minimal model | The LTS itself | Well-typed term | Sketch with holes filled |
| 4. Widgets | Further constraints | Render transitions | Widget sort + cross-sort maps | Holes for AI |
| 5. Rendered | AI from model | AI from LTS | AI from typed term | AI from abstract impl |

## Head-to-Head: What Works, What Doesn't

### The Hard Problem: Inductive Generalization

**All four approaches share the same hard problem**: generalizing from specific trace examples to general rules. "count went from 0 to 1 after increment" → "increment adds 1 to count." This is program synthesis / inductive inference. None of the four approaches solves it; they all defer to either:
- Heuristic rules (A, D's inference rules)
- User providing more traces to disambiguate (B)
- Type-directed search (C)
- Generative AI (all)

**Verdict**: This is the crux. The choice of approach doesn't eliminate this problem; it only changes how it's framed.

### Representing the Abstract Application

| Approach | Representation | Executable? | Checkable? | Diffable? |
|---|---|---|---|---|
| A | Constraint solution (model) | No (it's a set of facts) | Yes (check constraints) | Partially (diff the fact set) |
| B | Labeled transition system | Yes (simulate paths) | Yes (validate traces as paths) | Partially (diff transition function) |
| C | Well-typed term | Yes (evaluate the term) | Yes (type-check) | Hard (structural diff on typed trees) |
| D | Sketch with holes filled | Yes (run against traces) | Yes (validate traces) | Yes (structured diff is first-class) |

**B wins on executability** — the LTS is literally a simulator. You can run arbitrary scenarios, not just the ones in traces.

**D wins on diffability** — the sketch structure makes it natural to say "this hole was filled differently."

**C wins on coherence checking** — the type system catches "you put a button where a display should go."

### Widget Assembly

| Approach | How widgets emerge |
|---|---|
| A | Constraint rules: "string arg → form", "no arg → button" |
| B | Map: "each transition → an affordance" |
| C | Cross-sort morphism: Widget sort must be compatible with Intent sort |
| D | Widget holes in sketch, filled by rules or AI |

**They're essentially the same**. A's constraint rules, B's transition-to-affordance mapping, C's cross-sort compatibility, and D's inference rules all encode the same knowledge:

```
no-arg action → button
string-arg action → form (text input + submit)
index-arg action → per-item control inside a list
enum-arg action → selector
observable → display
complementary pair → toggle/checkbox
guard condition → conditional visibility
```

This table appears in all four approaches. It's *the* core knowledge for widget assembly, regardless of formal framework. The approaches differ in how they organize this knowledge (as Prolog rules, LTS rendering rules, typing rules, or sketch inference rules) but the knowledge itself is identical.

### Modality Independence

**B is the cleanest here.** The LTS is genuinely modality-free: states + transitions + observations. The same LTS maps to web, voice, CLI, paper forms. The other approaches can achieve this but it's less natural:

- A: The constraint model doesn't talk about modality, but it also doesn't have a clear "this is the modality-independent core" boundary.
- C: The Data + Intent sorts are modality-independent; the Widget sort is modality-specific. Clean separation, but requires the full type machinery.
- D: The abstract impl before widget holes are filled is modality-independent.

### Role of Generative AI

All four approaches arrive at roughly the same AI handoff point: a formal spec (model / LTS / typed term / abstract impl) that can be given to an LLM for code generation, with traces as a test suite.

**D is most explicit about this.** It treats the AI handoff as a first-class design decision and thinks about diffs.

**B provides the best "oracle"** — since the LTS is fully executable, you can generate candidate code, run the traces against it, and reject/regenerate if it fails. This is essentially test-driven generation.

## Recommendation: Layered Architecture

No single approach covers everything. The strongest design layers them:

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1-2: Traces → Data Model                             │
│                                                             │
│   Use A's constraint/inference rules to extract:            │
│   - Observables, actions, arg types, entities               │
│   - Effect hypotheses from before/after pairs               │
│   - Derived property inference from cross-trace patterns    │
│                                                             │
│   Generative AI assists with ambiguous generalizations      │
├─────────────────────────────────────────────────────────────┤
│ Phase 3: Abstract Application                               │
│                                                             │
│   Represent as B's LTS:                                     │
│   - States = data configurations                            │
│   - Transitions = actions                                   │
│   - Observations = derived + stored state                   │
│                                                             │
│   Validate: run all traces as paths through LTS             │
│   This is the modality-independent core                     │
├─────────────────────────────────────────────────────────────┤
│ Phase 4: Widget Assembly                                    │
│                                                             │
│   Use D's sketch approach:                                  │
│   - Apply structural inference rules (shared by all         │
│     approaches) to fill most widget holes                   │
│   - Use C's type compatibility to check: is this widget     │
│     assignment consistent with the intent + data?           │
│   - Remaining holes (layout, styling, interaction micro-    │
│     details) are left for AI                                │
│                                                             │
│   Output: abstract implementation = LTS + intent tree +     │
│   partially-specified widget tree                           │
├─────────────────────────────────────────────────────────────┤
│ Phase 5: Rendered Product                                   │
│                                                             │
│   AI generates code from abstract implementation            │
│   LTS serves as test oracle: run traces against generated   │
│   code, regenerate on failure                               │
│   On spec changes: structured diff → focused AI prompt      │
└─────────────────────────────────────────────────────────────┘
```

### What each approach contributes to the hybrid:

- **A (Constraints)**: The inference engine. How you go from raw traces to structured knowledge.
- **B (LTS)**: The representation. The abstract application *is* an LTS. Executable, checkable, modality-independent.
- **C (Types)**: The safety net. Cross-sort type checking catches incoherent widget/intent/data combinations.
- **D (Sketches)**: The pipeline. The overall process of incremental refinement, AI handoff, and diff-based updates.

## Open Design Questions

1. **How much type machinery is worth building?** C's full type system catches errors but is expensive to implement. A lighter version — just checking "button ↔ Do, display ↔ See, form ↔ Bind" compatibility — might capture 80% of the value at 20% of the cost.

2. **How much should the solver do vs. AI?** The solver can fill "mechanical" holes (string arg → form, index arg → list). But layout, styling, micro-interactions, and edge-case UX are better handled by AI. Where's the line?

3. **Is the LTS too low-level for the abstract application?** The LTS represents every state explicitly. For apps with infinite state spaces (any app with text input), you need a symbolic LTS (basically... a program). At what point does "LTS" become "just code"?

4. **Can traces really capture enough?** The traces in examples.md are thorough for the todo app, but they were hand-written with care. In practice, users will write incomplete traces. How does the system handle underspecification gracefully? (Approach D's answer: leave holes. Approach A's answer: multiple models are consistent, pick the simplest.)

5. **Data modeling: inferred or declared?** All approaches infer the data model from traces. But maybe users should *also* be able to declare entities and schemas directly ("there is a Todo with status and label"). This is the "intent modeling is related to but possibly distinct from data modeling" insight from the stream of consciousness.

## Validation Status

| Claim | Validated? | How |
|---|---|---|
| Traces can be parsed into structured constraints | Yes | Concrete Prolog program in A |
| Constraints determine an LTS | Partially | Defined LTS for counter + todo in B, but generalization is hand-waved |
| Type system catches incoherent compositions | Yes | Showed type errors for incompatible widget/intent pairs in C |
| Structural inference rules are complete | No | The rules cover the patterns seen in counter + todo, but are they sufficient for arbitrary apps? |
| Abstract impl → AI prompt → working code | Not tested | Would need actual LLM generation to validate |
| Diff-based updates work | Plausible | Showed a structured diff for "add archiveTodo" in D, but didn't test AI update |
| Modality independence holds | Partially | Sketched web/voice/paper/CLI mappings for same LTS in B. Convincing but not proven |

## Next Steps for Validation

1. **Pick the counter app** (simplest). Implement the full pipeline: trace → constraints → LTS → abstract impl → React code (AI-generated) → run traces against rendered app. This is the minimum viable validation.

2. **Pick two traces from the todo app** (e.g., "add + complete" and "filtering"). Run the same pipeline. The todo app tests: forms (bind), lists (each), selectors (pick), conditionals (when), toggles (both).

3. **Test diffing.** Start with the counter. Add a "reset" action. Show that the diff flows through cleanly: new constraint → updated LTS → updated abstract impl → focused AI prompt → updated React code.
