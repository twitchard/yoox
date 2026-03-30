# Approach C: Type-Theoretic / Categorical

## Overview

Take the "three universes" analogy seriously. There are three **sorts** (or categories): **Data**, **Intent**, **Widget**. Cross-universe operations are **morphisms** (typed maps) between sorts. A well-formed application is a term that type-checks across all three sorts simultaneously. Composition operators are type constructors. Traces are typing judgments.

## The Three Sorts

### Data Sort

Objects: types and values.

```
Nat : Type
String : Type
Bool : Type
Enum(V₁, ..., Vₙ) : Type
Record(f₁: T₁, ..., fₙ: Tₙ) : Type
List(T) : Type

0 : Nat
"Buy milk" : String
active : Enum(active, completed)
Todo(active, "Buy milk") : Record(status: Enum(active, completed), label: String)
```

Morphisms within Data: functions between types (state transitions).

```
increment : State → State    where State = Record(count: Nat)
addTodo : String → State → State
```

### Intent Sort

Objects: intents (things a user might want to do).

```
See(T) : Intent                    -- observe a value of type T
Do(T₁ → S → S) : Intent           -- trigger a state transition (possibly with input T₁)
Give(T) : Intent                   -- supply a value of type T
```

Morphisms within Intent: refinement (an intent can be refined to a more specific one).

```
Do(S → S) ⊑ Do(increment)         -- "trigger something" refines to "trigger increment"
See(Any) ⊑ See(Nat)               -- "observe something" refines to "observe a natural number"
```

### Widget Sort

Objects: UI components.

```
Button : Widget
TextInput : Widget
Display : Widget
Container(W₁, ..., Wₙ) : Widget   -- group
Repeat(W, T) : Widget              -- list of W over collection of T
Conditional(P, W) : Widget         -- show W when P holds
```

Morphisms within Widget: containment, adjacency.

## Cross-Sort Morphisms

This is where it gets interesting. The three sorts are connected by **maps**:

```
fulfills : Widget → Intent         -- what intent does this widget fulfill?
displays : Widget → Data           -- what data type does this widget show/accept?
label : Intent → Widget → Widget   -- attach an intent to a widget (returns a more specific widget)
```

### The key typing rule: well-formedness

A **labeled widget** is well-formed iff its widget sort, intent sort, and data sort are all compatible:

```
                     w : Widget    i : Intent    T : Data
                     compatible(w, i, T)
                  ──────────────────────────────────
                     label(i, w) : LabeledWidget(i, T)
```

Where `compatible` is defined by:

```
compatible(Button, Do(f), T)         iff  f : T → State → State   (button triggers an action)
compatible(Display, See(T), T)       iff  true                     (display shows a value)
compatible(TextInput, Give(T), T)    iff  T = String               (text input supplies strings)
```

An incompatible assignment is a type error:

```
label(See(count), Button)    -- TYPE ERROR: buttons don't observe
label(Do(increment), Display) -- TYPE ERROR: displays don't trigger actions
```

## Composition Operators as Type Constructors

### `bind` as a dependent product

```
bind : Give(T) × Do(T → S → S) → Form(T)

-- "Form(T)" is a new type: a widget that supplies T and triggers an action consuming T
-- This is like a dependent pair: the action's input type depends on what the Give produces
```

In the counter, there's no `bind` (no actions take arguments). In the todo app:

```
bind(Give(String), Do(addTodo)) : Form(String)
-- Type checks because addTodo : String → State → State
-- The Give(String) and Do(String → ...) agree on the String type
```

If you tried:

```
bind(Give(Nat), Do(addTodo)) : ???
-- TYPE ERROR: addTodo expects String, not Nat
```

The type system catches this.

### `both` as a product type

```
both : Intent × Intent → Intent

both(See(Bool), Do(Bool → S → S)) : Intent
-- A widget fulfilling this must simultaneously show a bool and trigger its negation
-- This is the type of a checkbox
```

### `each` as a dependent function type (Π type)

```
each : List(T) × (T → Intent) → Intent

each(todos, λt. group(See(t.status), See(t.label), Do(remove(t)))) : Intent
```

This is literally a Π type: for each `t` in the collection, produce an intent parameterized by `t`. The widget-level realization is a list of repeated components.

### `pick` as a sum type

```
pick : Intent × Intent × ... → Intent

pick(Do(setFilter(all)), Do(setFilter(active)), Do(setFilter(completed))) : Intent
```

A sum type: the user chooses exactly one branch. Widget-level: a radio group, tab bar, or dropdown.

### `when` as a guarded type

```
when : (State → Bool) × Intent → Intent

when(λs. s.editingTodo ≠ nil, editFormIntent) : Intent
-- This intent only "exists" when the predicate holds
```

### `group` as a product type

```
group : Intent × Intent × ... → Intent
-- Straightforward product: all intents are simultaneously available
```

## Counter App as a Typed Term

```
counterApp : App

counterApp = group(
  label("count", display(count)) : LabeledWidget(See(Nat), Nat),
  label("increment", button(increment)) : LabeledWidget(Do(Nat → Nat), Nat),
  label("decrement", button(decrement)) : LabeledWidget(Do(Nat → Nat), Nat)
)

-- Type derivation:
-- 1. count : Nat                                    (Data sort)
-- 2. See(Nat) : Intent                              (Intent sort, from observing count)
-- 3. display : Widget                                (Widget sort)
-- 4. compatible(display, See(Nat), Nat) ✓            (cross-sort check)
-- 5. label("count", display(count)) : LabeledWidget  (all three sorts agree)
--
-- 6. increment : Nat → Nat                           (Data sort)
-- 7. Do(increment) : Intent                           (Intent sort)
-- 8. button : Widget                                  (Widget sort)
-- 9. compatible(button, Do(increment), Nat) ✓         (cross-sort check)
-- 10. label("increment", button(increment)) : LabeledWidget
--
-- 11. group(5, 10, ...) : App                         (all children type-check)
```

## Todo App Fragment as a Typed Term

```
-- The addTodo form
addForm = bind(
  label("task", textInput) : LabeledWidget(Give(String), String),
  label("Add", button(addTodo)) : LabeledWidget(Do(String → State → State), String)
) : Form(String)

-- Type check for bind:
-- Give(String) and Do(String → State → State) agree on String ✓

-- A single todo item
todoItem(t : Todo) = group(
  both(
    label(t.label, display(t.status)) : LabeledWidget(See(Bool), Bool),
    button(toggleStatus(t)) : LabeledWidget(Do(Bool → Bool), Bool)
  ) : LabeledWidget(BothIntent(See(Bool), Do(Bool → Bool)), Bool),
  label("Delete", button(remove(t))) : LabeledWidget(Do(Unit → State → State), Unit)
)

-- The todo list
todoList = each(
  visibleTodos : List(Todo),
  λt. todoItem(t)
) : RepeatedWidget(Todo, todoItem)

-- Type check for each:
-- visibleTodos : List(Todo) ✓
-- todoItem : Todo → group(...) ✓
-- Each element of the list gets bound to t ✓

-- The filter selector
filterBar = pick(
  label("All", button(setFilter(all))),
  label("Active", button(setFilter(active))),
  label("Completed", button(setFilter(completed)))
) : SelectorWidget(Filter)

-- Type check for pick:
-- All three are Do(Enum → State → State) with the same enum type ✓
```

## Traces as Typing Judgments

A trace line is evidence for a typing judgment:

| Trace line | Judgment it evidences |
|---|---|
| `count == 0` | `count : Nat` (Data), `See(Nat) : Intent` (Intent), "need a display" (Widget) |
| `increment()` | `increment : State → State` (Data), `Do(increment) : Intent`, "need a button" (Widget) |
| `addTodo("Buy milk")` | `addTodo : String → State → State` (Data), `Do(addTodo) : Intent` + `Give(String) : Intent`, "need a form" (Widget) — the String arg means `bind` is required |
| `markDone(0_visibleTodo)` | Index arg → `each` is required (Π type). The `0_visibleTodo` is a witness that `visibleTodos` is a `List` being iterated over. |
| `setFilter(:active)` | Enum arg → `pick` is required (sum type). The `:active` is one branch of the sum. |

## Where This Approach Illuminates

1. **Type errors catch incoherent designs.** If someone writes a trace where a display widget triggers an action, or a button observes a value, the type system flags it. The cross-sort compatibility check prevents nonsensical compositions.

2. **Composition operators have familiar type-theoretic names.** `bind` ≈ dependent pair, `each` ≈ Π type, `pick` ≈ sum type, `group` ≈ product type, `when` ≈ guarded/refinement type, `both` ≈ intersection type. This connects to a large body of theory.

3. **Completeness checking.** A well-typed application must have a widget for every intent, and an intent for every data operation. If you add an action to the data model but don't have a corresponding intent + widget, the term doesn't type-check. Missing UI = type error.

## Where This Approach Is Overengineered

1. **The type system is the system.** If you actually build this, you're building a custom type checker. That's a real programming language implementation project. The benefit (catching composition errors) might not justify the cost when you have <100 components.

2. **Types don't solve the hard problems.** The hard part isn't checking that a composition is well-formed — it's *finding* the right composition. Types tell you "this is wrong" but not "here's what's right." You still need synthesis (Approach A) or construction (Approach D) on top.

3. **The three-sort structure might be a false trichotomy.** In practice, intents and data are tightly coupled (the intent "add a todo" and the data operation `addTodo` are almost the same thing). Making them formally separate sorts with explicit morphisms between them might add ceremony without adding insight. The counter-argument: separating them enables the abstract application layer (intent + data, no widgets).

4. **Overkill for simple apps.** The counter's typing derivation has 11 steps for 3 widgets. The type system adds value when compositions are complex and error-prone; for small apps it's overhead.

## Where Generative AI Plugs In

1. **Type-directed code generation.** Given a typed abstract application (the term in the Intent × Data sorts), an LLM generates code that *must type-check* against the widget sort. The types constrain the LLM's output — it can't generate a button where a display is needed.

2. **Type error messages as prompts.** If a generated UI doesn't type-check, the type error is a precise description of what's wrong: "Expected LabeledWidget(See(Nat), Nat), got LabeledWidget(Do(...), ...)". This is a much better correction signal than "it looks wrong."

3. **Type-directed hole filling.** If the abstract application has holes (unspecified intents), the type system narrows the search space: "this hole must be filled with an Intent that's compatible with Widget=Display and Data=Nat." The LLM can fill holes with type guidance.

## Comparison

- **vs. Approach A (constraints):** Types are a *structured* form of constraints. A type judgment `x : T` is a constraint, but organized into a sort system. Types give you better error messages and compositional reasoning, but are harder to implement.
- **vs. Approach B (LTS):** The LTS lives entirely in the Data sort. The type theory adds the Intent and Widget sorts on top, ensuring the UI is consistent with the data model. You could layer C on top of B: the LTS is the Data sort, the type theory adds Intent + Widget.
