# Approach D: Sketch-Based Synthesis with Abstract Implementation Output

## Overview

This approach takes program synthesis seriously. The user provides **traces** (the specification). The system maintains a **sketch** — a partial program with explicit holes. A solver fills holes to satisfy the spec. But crucially, the output is NOT a renderable app. It's an **abstract implementation**: a logical, checkable, abstractly-runnable spec. This spec is then handed to generative AI to produce the final rendered product. When the spec changes, the *diff* is what gets sent to AI.

This is the closest to the "assembly language with holes" already sketched, but made rigorous.

## What Is a Sketch?

A sketch is a partial program. Some parts are concrete; others are **holes** (written `??`). The solver's job is to fill every `??` with a concrete value such that the spec (traces) is satisfied.

### Counter sketch (initial — maximally holey)

```
App {
  state: { ?? },
  initial: { ?? },
  actions: { ?? },
  derived: { ?? },
  intents: { ?? },
  widgets: { ?? }
}
```

Everything is unknown. The trace is the only information:

```
SPEC:
  count == 0;
  increment();
  count == 1;
  decrement();
  count == 0;
```

### Counter sketch (after processing trace)

The solver works through the spec line by line:

**`count == 0`** → There's an observable `count`. It has value 0 initially.

```
App {
  state: { count: ?? },            -- count exists, type unknown
  initial: { count: 0 },           -- initial value known
  actions: { ?? },
  derived: { ?? },
  intents: { see_count: See(??) }, -- there's an intent to see count
  widgets: { ?? }
}
```

**`increment()`** → There's an action `increment` with no arguments.

```
App {
  state: { count: ?? },
  initial: { count: 0 },
  actions: { increment: () → { count: ?? } },  -- effect unknown
  derived: { ?? },
  intents: { see_count: See(??), do_increment: Do(increment) },
  widgets: { ?? }
}
```

**`count == 1`** → After increment, count is 1. Since count was 0 before, we can infer the effect.

```
App {
  state: { count: Int },                          -- type inferred: Int
  initial: { count: 0 },
  actions: { increment: () → { count: count + 1 } },  -- effect inferred from 0 → 1
  derived: {},
  intents: { see_count: See(Int), do_increment: Do(increment) },
  widgets: { w_count: ??, w_increment: ?? }       -- need widgets but don't know what kind yet
}
```

**`decrement()` + `count == 0`** → fills in the decrement action:

```
App {
  state: { count: Int },
  initial: { count: 0 },
  actions: {
    increment: () → { count: count + 1 },
    decrement: () → { count: count - 1 }
  },
  derived: {},
  intents: {
    see_count: See(Int),
    do_increment: Do(increment),
    do_decrement: Do(decrement)
  },
  widgets: {
    w_count: ??,          -- hole: what widget shows count?
    w_increment: ??,      -- hole: what widget triggers increment?
    w_decrement: ??       -- hole: what widget triggers decrement?
  }
}
```

At this point, the **abstract implementation** is complete: state, initial, actions, derived, intents are all fully specified. Only the widgets have holes. This is the boundary where generative AI takes over.

## The Abstract Implementation

The abstract implementation is the output of the synthesis phase. It contains everything needed to build a concrete app, but is not itself renderable:

```
AbstractImpl {
  -- Data layer (fully specified)
  state: Map<Name, Type>
  initial: Map<Name, Value>
  actions: Map<Name, { args: List<(Name, Type)>, effect: State → State }>
  derived: Map<Name, State → Value>
  invariants: List<State → Bool>

  -- Intent layer (fully specified)
  intents: List<Intent>
  intent_structure: Tree<Intent>  -- how intents compose (group, bind, each, pick, when, both)

  -- Widget layer (holes allowed)
  widgets: Map<Name, Widget | Hole>
  widget_structure: Tree<Widget | Hole>
  constraints: List<WidgetConstraint>  -- e.g., "w_increment must be compatible with Do(increment)"
}
```

The key property: **the abstract implementation is checkable**. You can:

1. Run every trace against it and verify assertions hold
2. Check that intents are consistent with data (every Do has an action, every See has an observable)
3. Check that widget constraints are satisfiable (there exists an assignment of widgets to holes that works)

## Todo App: Sketch Evolution

Let me trace through a few key moments:

### After trace 2 (add one todo):

```
SPEC: addTodo("Buy milk"); todos == [Todo(:active, "Buy milk")];
```

```
AbstractImpl {
  state: { todos: List<Todo> },
  entities: { Todo: { status: Enum(active, completed), label: String } },
  initial: { todos: [] },
  actions: {
    addTodo: (text: String) → { todos: todos ++ [Todo(active, trim(text))] }
  },
  intents: {
    see_todos: See(List<Todo>),
    do_addTodo: Do(addTodo),
    give_text: Give(String),            -- inferred from: addTodo takes a String
    form_addTodo: Bind(give_text, do_addTodo)  -- inferred from: action + arg = form
  }
}
```

Note: the solver inferred `Give(String)` and `Bind` from the fact that `addTodo` takes a string argument. This is a **structural inference rule**:

```
RULE: If action A takes arg of type T, then:
  - Intent Give(T) must exist
  - Intent Bind(Give(T), Do(A)) must exist
  - Widget for Give(T) must be present and associated with widget for Do(A)
```

### After trace 5 (complete and reopen):

```
SPEC: markDone(0_visibleTodo); markUndone(0_visibleTodo);
```

New inferences:

```
actions += {
  markDone: (i: Index<visibleTodos>) → { todos[resolve(i)].status: completed },
  markUndone: (i: Index<visibleTodos>) → { todos[resolve(i)].status: active }
}

intents += {
  toggle_status: Both(See(todo.status), Do(toggleStatus)),  -- complementary pair
  -- INFERRED: markDone + markUndone on same field = toggle
}

intent_structure: Each(visibleTodos, λtodo.
  Group(toggle_status(todo), see_label(todo), ...)
)
-- INFERRED: Index<visibleTodos> arg = per-item intent = Each
```

Structural inference rules at work:

```
RULE: If action A takes arg of type Index<Collection>, then:
  - Intent Each(Collection, λitem. ...) must exist
  - Do(A) is nested inside the Each

RULE: If actions A and B are complementary (same field, opposite effects), then:
  - Intent Both(See(field), Do(toggle)) replaces separate Do(A), Do(B)
```

### After trace 9 (filtering):

```
SPEC: setFilter(:active); setFilter(:completed); setFilter(:all);
```

```
actions += {
  setFilter: (f: Enum(all, active, completed)) → { filter: f }
}

intents += {
  pick_filter: Pick(
    Name("All", Do(setFilter(all))),
    Name("Active", Do(setFilter(active))),
    Name("Completed", Do(setFilter(completed)))
  )
  -- INFERRED: Enum arg + multiple values seen = Pick
}
```

Structural inference rule:

```
RULE: If action A takes arg of type Enum(V₁, ..., Vₙ), then:
  - Intent Pick(Name(V₁, Do(A(V₁))), ..., Name(Vₙ, Do(A(Vₙ)))) must exist
```

## The Inference Rules (Complete Set)

Here's the full set of structural rules the solver uses:

```python
def infer_intents(abstract_impl):
    for obs in abstract_impl.observables:
        yield See(obs.type), named(obs.name)

    for action in abstract_impl.actions:
        if action.arity == 0:
            yield Do(action), named(action.name)

        elif action.arg_type == String:
            give = Give(String)
            do = Do(action)
            yield Bind(named(action.arg_name, give), named(action.name, do))

        elif action.arg_type == Index(collection):
            do = Do(action)
            # This action lives inside an Each over collection
            yield PerItem(collection, do)

        elif action.arg_type == Enum(values):
            branches = [Named(v, Do(action.partial(v))) for v in values]
            yield Pick(*branches)

    # Detect complementary pairs
    for a1, a2 in pairs(abstract_impl.actions):
        if same_field(a1, a2) and complementary_effects(a1, a2):
            field = shared_field(a1, a2)
            yield Both(See(field.type), Do(toggle(a1, a2)))
            # Remove individual Do(a1), Do(a2)

    # Detect mode/guard patterns
    for obs in abstract_impl.observables:
        if obs is used_as_guard_in_traces:
            guarded_intents = intents_only_available_when(obs != nil)
            yield When(obs != nil, Group(*guarded_intents))
```

## Diffing: When Specs Change

Suppose the user adds a new trace:

```
addTodo("Buy milk");
archiveTodo(0_visibleTodo);
todos == [Todo(:archived, "Buy milk")];
```

The solver processes the diff:

1. `archiveTodo` is a new action → add to actions
2. Its arg type is `Index<visibleTodos>` → it's per-item (like markDone)
3. `:archived` is a new status value → extend `Enum(active, completed)` to `Enum(active, completed, archived)`
4. Intent tree: add `Do(archiveTodo)` inside the existing `Each(visibleTodos, ...)`

The **abstract impl diff** is:

```diff
  entities.Todo.status: Enum(active, completed)
+ entities.Todo.status: Enum(active, completed, archived)
+ actions.archiveTodo: (i: Index<visibleTodos>) → { todos[resolve(i)].status: archived }
+ intents.each_todo.children += Named("Archive", Do(archiveTodo))
```

This diff — not the full spec — is what gets handed to generative AI to update the rendered product.

## The AI Handoff

### What the prompt looks like (initial generation):

```
Given this abstract application specification:

State:
  - todos: List<Todo> (initially [])
  - filter: Enum(all, active, completed) (initially: all)

Entities:
  - Todo: { status: Enum(active, completed), label: String }

Actions:
  - addTodo(text: String): append Todo(active, trim(text)) to todos
  - markDone(i): set visibleTodos[i].status to completed
  - markUndone(i): set visibleTodos[i].status to active
  - removeTodo(i): remove visibleTodos[i] from todos
  [... etc]

Derived:
  - visibleTodos = todos filtered by current filter
  - remainingCount = count of todos where status == active
  [... etc]

Intent structure:
  Group(
    Bind(Named("task", Give(String)), Do(addTodo)),       -- add form
    Both(See(allCompleted), Do(toggleAll)),                 -- toggle-all
    Each(visibleTodos, λtodo.
      Group(
        Both(See(todo.status), Do(toggle)),
        Named(todo.label, See(todo)),
        Named("Delete", Do(removeTodo)),
        When(editing == todo, Bind(Give(String), ...))
      )
    ),
    Pick(Named("All", ...), Named("Active", ...), Named("Completed", ...)),
    Named("remaining", See(remainingCount)),
    Named("Clear completed", Do(clearCompleted))
  )

Generate a complete React application implementing this specification.
The intent structure tells you the component hierarchy.
```

### What the diff prompt looks like (update):

```
The following changes were made to the application specification:

1. Todo status now includes "archived" (was: active, completed)
2. New action: archiveTodo(i) sets visibleTodos[i].status to archived
3. New per-item intent: Named("Archive", Do(archiveTodo)) added to each todo item

Update the existing React application to reflect these changes.
The existing code is: [... current code ...]
```

## Pseudo-Implementation: Counter Pipeline

```python
# Phase 1: Parse trace
trace = parse("""
  count == 0;
  increment();
  count == 1;
  decrement();
  count == 0;
""")
# → [Assert("count", 0), Action("increment", []), Assert("count", 1),
#    Action("decrement", []), Assert("count", 0)]

# Phase 2: Build sketch from trace
sketch = Sketch()

for line in trace:
    if isinstance(line, Assert):
        sketch.add_observable(line.name, infer_type(line.value))
        sketch.set_value_at_point(line.name, line.value)
    elif isinstance(line, Action):
        sketch.add_action(line.name, arg_types=[infer_type(a) for a in line.args])

# Phase 3: Infer effects by simulating trace against sketch
sketch.infer_effects(trace)
# increment: saw count go 0 → 1, hypothesize count := count + 1
# decrement: saw count go 1 → 0, hypothesize count := count - 1

# Phase 4: Infer intents from action signatures
sketch.infer_intents()
# count (observable, Int) → See(Int)
# increment (no args) → Do(increment)
# decrement (no args) → Do(decrement)
# All top-level → Group(Named("count", See(Int)), Named("increment", Do(...)), Named("decrement", Do(...)))

# Phase 5: Validate
for t in all_traces:
    assert sketch.validate(t), f"Trace {t} failed validation"

# Phase 6: Emit abstract implementation
abstract_impl = sketch.to_abstract_impl()
print(abstract_impl)
# AbstractImpl {
#   state: { count: Int }
#   initial: { count: 0 }
#   actions: { increment: () → count + 1, decrement: () → count - 1 }
#   derived: {}
#   intents: Group(Named("count", See(Int)), Named("increment", Do), Named("decrement", Do))
# }

# Phase 7: Hand to AI for rendering
prompt = abstract_impl.to_generation_prompt(target="react")
rendered_code = llm.generate(prompt)

# Phase 8: Validate rendered code against traces
for t in all_traces:
    assert run_in_browser(rendered_code, t), f"Rendered app fails trace {t}"
```

## Strengths

1. **Incremental.** Sketches refine incrementally as traces are added. You don't need all traces upfront.

2. **The abstract impl is checkable.** You can validate it against traces mechanically. This is the "trust boundary" — everything above is formal, everything below (AI-generated code) is checked against it.

3. **Diffs are first-class.** When specs change, you get a structured diff of the abstract impl, which is a much better signal for AI code updates than "the spec changed, figure it out."

4. **Separation of concerns.** The solver handles the logic (what state, what actions, what intents). The AI handles the presentation (layout, styling, framework-specific code). Each does what it's good at.

5. **The inference rules are simple and enumerable.** String arg → form. Index arg → per-item. Enum arg → selector. Complementary pair → toggle. Guard → conditional. There aren't that many patterns.

## Weaknesses

1. **Effect inference is hard.** Going from "count was 0, then increment, then count is 1" to "increment means count := count + 1" is easy. Going from "todos was [A, B], then markDone(1), then todos is [A, B'] where B'.status = completed" to the general rule requires more sophisticated induction.

2. **Ambiguity in generalization.** When is the solver confident it has the right general rule vs. an overfitting? `count` going from 0 to 1 could be `+1` or `set to 1`. You need multiple traces to disambiguate. The solver needs a notion of confidence or a way to ask the user.

3. **Widget holes might be too underspecified for AI.** The abstract impl says "need a Form(String) for addTodo" but doesn't say whether it should be a text input + button, or a text input with submit-on-enter, or a rich text editor. The AI fills this in, but different AI runs might produce inconsistent results.

4. **The inference rules hardcode patterns.** "String arg → form" is a heuristic, not a theorem. What about an action that takes a String but shouldn't be a form (e.g., a command parser that takes raw input)? The rules would need escape hatches or user overrides.

## Comparison

- **vs. A (constraints):** Sketches are a *structured* way to organize constraints. Instead of a flat set of Prolog facts, you have a hierarchical sketch with named holes. The inference rules are the same, but the sketch gives them a home.
- **vs. B (LTS):** The abstract impl includes an LTS (state + actions = transition system). But it also includes intents and widget constraints, which the pure LTS lacks.
- **vs. C (types):** The sketch's holes are like type holes (unification variables). The inference rules are like type inference rules. But the sketch approach is more operational (fill holes step by step) while the type approach is more declarative (check that everything is well-typed at the end).

## The Hybrid: Best of All Worlds?

The strongest approach might combine:
- **B's LTS** as the core abstract application (executable, checkable)
- **A's constraint rules** for inferring the LTS from traces
- **C's type system** for checking that widget assembly is consistent
- **D's sketch + AI handoff** for the synthesis pipeline and rendering

The abstract impl would be a typed LTS with intent annotations:

```
TypedLTS {
  lts: LTS(states, transitions, observations),     -- from B
  types: TypeEnv(sorts, judgments),                 -- from C
  intents: IntentTree(see, do, give, operators),    -- from C's Intent sort
  constraints: ConstraintSet(trace-derived),        -- from A
  widget_sketch: WidgetTree(concrete | hole)        -- from D
}
```
