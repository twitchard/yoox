# Intent Decomposition / Component Composition: Worked Examples

## The Atomic Intents

There are only three things a user can do with a piece of UI:

| Atomic intent | What it means |
|---|---|
| `see(v)` | Observe a value |
| `do(a)` | Trigger a state change |
| `give(T)` | Supply a value of some type T |

Everything else — every widget, every form, every app — is built by composing these three with a small set of operators.

## The Composition Operators

| Operator | Signature | What it does |
|---|---|---|
| `name(n, I)` | string × intent → intent | Narrows a generic intent to a specific one. This is how meaning enters the system. |
| `bind(give(T), do(a))` | supply × action → intent | Feeds the supplied value into the action as its argument. This is what makes a form a form. |
| `both(I₁, I₂)` | intent × intent → intent | Fuses two intents into one component. The component simultaneously fulfills both. |
| `group(I₁, ..., Iₙ)` | intent* → intent | Juxtaposes intents. The composite intent is the union. |
| `each(collection, I)` | collection × intent → intent | Repeats an intent per item, binding each instance to an index. |
| `pick(I₁, ..., Iₙ)` | intent* → intent | Choose exactly one from a set of intents. Mutually exclusive. |
| `when(condition, I)` | predicate × intent → intent | Intent is only available/visible when condition holds. |

### What's NOT a primitive

Things that look like primitives but are actually composed:

**Checkbox** = `both(see(bool), do(toggle))`
A checkbox is not atomic. It *simultaneously* lets you observe a boolean and trigger its negation. It fuses `see` and `do` on the same piece of state. That's `both`.

**Selector / radio group** = `pick(do(a₁), do(a₂), ..., do(aₙ))`
A selector is not a primitive widget. It's `pick` applied to a set of actions. "Choose one of these options" is composed from "trigger A" + "trigger B" + ... + mutual exclusion.

**Form** = `bind(give(T), do(a))`
A form is not a container with inputs and a button. It's the *binding* of a supplied value to an action. The text input fulfills `give(text)`. The button fulfills `do(submit)`. The form's `bind` is what wires the text input's value into the submit action's argument. Without `bind`, they're just two widgets sitting next to each other.

**Labeled button** = `name("increment", do(increment))`
A button with a label is not a primitive. The bare button fulfills only the generic `do(???)`. The name operator is what takes it from "trigger something" to "trigger increment."

---

## 1. Counter App

### The Trace

```
!GET /
count == 0;
increment();
count == 1;
decrement();
count == 0;
```

### Reading intents off the trace

Each line maps to an atomic intent:

| Trace element | Atomic intent | Why |
|---|---|---|
| `count == 0` | `see(count)` | Asserting a value means the user can observe it |
| `increment()` | `do(increment)` | Calling a no-arg action means the user can trigger it |
| `decrement()` | `do(decrement)` | Same |

The names `count`, `increment`, `decrement` are present in the trace itself. They become arguments to `name`.

### Composition (bottom-up)

```
                         ╭──────────────────────────────╮
                         │ name("count", see(count))    │  "observe the count"
                         ├──────────────────────────────┤
  group ─────────────────│ name("inc", do(increment))   │  "increase the count"
                         ├──────────────────────────────┤
                         │ name("dec", do(decrement))   │  "decrease the count"
                         ╰──────────────────────────────╯
                           = "track and adjust a count"
```

That's it. Three atomic intents, three `name` applications, one `group`. No `bind`, no `each`, no `pick`, no `when`, no `both`. The counter uses only two of the seven operators.

### Rendered

Each composed intent maps to a concrete widget:

- `name(n, see(v))` → a label `n` next to a text display of `v`
- `name(n, do(a))` → a button labeled `n` that calls `a`
- `group(...)` → a container (div, panel, etc.)

```
┌─────────────────────────┐
│ count: 0                │  ← name("count", see(count))
│ [increment] [decrement] │  ← name("inc", do(inc)) + name("dec", do(dec))
└─────────────────────────┘     group(...)
```

---

## 2. Todo App

### Reading intents off the traces

The traces in `examples.md` give us these atomic intents:

| Trace pattern | Atomic intent | Operator implied |
|---|---|---|
| `todos == [...]` | `see(todos)` | — |
| `remainingCount == 1` | `see(remainingCount)` | — |
| `filter == :active` | `see(filter)` | — |
| `addTodo("Buy milk")` | `do(addTodo)` with text arg | `bind` — the text arg means give(text) is bound to the action |
| `markDone(0_visibleTodo)` | `do(markDone)` with index arg | `each` — the index arg means this is per-item |
| `markUndone(0_visibleTodo)` | `do(markUndone)` with index arg | `each` + `both` (same position as markDone → toggle) |
| `removeTodo(0_visibleTodo)` | `do(removeTodo)` with index arg | `each` |
| `markAllDone()` | `do(markAllDone)` no arg | — |
| `clearCompleted()` | `do(clearCompleted)` no arg | — |
| `setFilter(:active)` | `do(setFilter)` with enum arg | `pick` — enum arg means choose from fixed set |
| `startEditing(0_visibleTodo)` | `do(startEditing)` with index | `when` — editing introduces a mode |
| `setEditLabel("...")` | `give(text)` | `bind` (to saveEdit) |
| `saveEdit()` | `do(saveEdit)` | — |
| `cancelEdit()` | `do(cancelEdit)` | — |

**The trace signatures tell us which operators to use:**

- **Text argument** → `bind(give(text), do(action))` → a form
- **Index argument** → `each(collection, ...)` → per-item repetition
- **Enum argument** → `pick(do(a₁), ..., do(aₙ))` → a selector
- **Complementary actions on same state** (markDone/markUndone) → `both(see, do)` → a toggle
- **Mode-introducing action** (startEditing) → `when(mode, ...)` → conditional

### Composition (bottom-up)

**Step 1: Name the atomic intents.**

```
see(count)       →  name("remaining", see(remainingCount))       "observe remaining count"
see(count)       →  name("completed", see(completedCount))       "observe completed count"
do(action)       →  name("Clear completed", do(clearCompleted))  "trigger clear completed"
do(action)       →  name("Delete", do(removeTodo))               "trigger delete"
do(action)       →  name("Save", do(saveEdit))                   "trigger save"
do(action)       →  name("Cancel", do(cancelEdit))               "trigger cancel"
```

**Step 2: `both` — fuse see + do on the same state.**

`markDone` and `markUndone` operate on the same boolean (`todo.status`). The user both *sees* the status and *toggles* it. That's `both`:

```
both(see(todo.status), do(toggleStatus))
  = "see and toggle this task's completion"
```

This is what renders as a checkbox. The checkbox isn't a primitive — it's `both(see, do)`.

Similarly, `markAllDone`/`markAllUndone` operate on the aggregate boolean `allCompleted`:

```
both(see(allCompleted), do(toggleAll))
  = "see and toggle whether all tasks are complete"
```

**Step 3: `bind` — form composition.**

`addTodo("Buy milk")` takes a text argument. That means somewhere there's a `give(text)` (a text input) whose value gets bound to `addTodo`:

```
bind(name("task", give(text)), do(addTodo))
  = "supply a task description and add it"
```

This is a form. The `bind` is what wires the text input's value into the action. Without `bind`, you'd have a text input and a button that don't know about each other.

Similarly, the edit flow: `setEditLabel("...")` is `give(text)`, and it's bound to `saveEdit()`:

```
bind(give(text), name("Save", do(saveEdit)))
  = "supply a new label and save it"
```

**Step 4: `group` — per-item composition.**

For each visible todo, the user can: see it, toggle it, delete it, and (conditionally) edit it. Group these:

```
group(
  both(see(todo.status), do(toggleStatus)),          "see and toggle completion"
  name(todo.label, see(todo)),                       "see this task"
  name("Delete", do(removeTodo)),                    "trigger delete"
)
  = "see and act on one task"
```

**Step 5: `when` — conditional edit mode.**

The edit form only appears when `editingTodo == thisItem`:

```
when(editing == this,
  group(
    bind(give(text), name("Save", do(saveEdit))),    "supply new label and save"
    name("Cancel", do(cancelEdit))                   "trigger cancel"
  )
)
  = "edit this task's label (only when in edit mode)"
```

Note: `cancelEdit` is NOT inside the `bind`. It doesn't use the text input's value — it discards it. So it's a sibling in the `group`, not part of the `bind`.

**Step 6: `each` — repetition over the list.**

Every action that takes an index arg (`markDone(0_visibleTodo)`, `removeTodo(0_visibleTodo)`, etc.) is inside a repeated context:

```
each(visibleTodos,
  group(
    both(see(todo.status), do(toggleStatus)),
    name(todo.label, see(todo)),
    name("Delete", do(removeTodo)),
    when(editing == this,
      group(
        bind(give(text), name("Save", do(saveEdit))),
        name("Cancel", do(cancelEdit))
      )
    )
  )
)
  = "see and act on all visible tasks"
```

`each` introduces the item index. That's why `markDone(0_visibleTodo)` has the `0_visibleTodo` — it's the index bound by `each`.

**Step 7: `pick` — filter selection.**

`setFilter(:active)` takes an enum argument. The trace shows three values: `:all`, `:active`, `:completed`. That's `pick`:

```
pick(
  name("All",       do(setFilter(:all))),
  name("Active",    do(setFilter(:active))),
  name("Completed", do(setFilter(:completed)))
)
  = "choose which tasks to see"
```

`pick` means exactly one is selected at a time. That's a selector / tab bar / radio group.

**Step 8: `group` — the whole app.**

```
group(                                                           "manage a list of tasks"

  bind(name("task", give(text)), do(addTodo)),                     "add a task"
                                                                   ├─ bind: form
                                                                   ├─ name + give: labeled text input
                                                                   └─ do: submit

  both(see(allCompleted), do(toggleAll)),                          "toggle all completion"
                                                                   └─ both: checkbox

  each(visibleTodos,                                               "see and act on all tasks"
    group(                                                           └─ each: repetition
      both(see(todo.status), do(toggle)),                                ├─ both: checkbox
      name(todo.label, see(todo)),                                       ├─ name + see: label
      name("Delete", do(removeTodo)),                                    ├─ name + do: button
      when(editing == this,                                              └─ when: conditional
        group(                                                               └─ group
          bind(give(text), name("Save", do(saveEdit))),                          ├─ bind: form
          name("Cancel", do(cancelEdit))                                         └─ name + do: button
        )
      )
    )
  ),

  pick(                                                            "choose filter"
    name("All",       do(setFilter(:all))),                        └─ pick: selector
    name("Active",    do(setFilter(:active))),
    name("Completed", do(setFilter(:completed)))
  ),

  group(                                                           "see summary"
    name("remaining", see(remainingCount)),                        └─ group
    name("completed", see(completedCount))                             ├─ name + see: display
  ),                                                                   └─ name + see: display

  name("Clear completed", do(clearCompleted))                      "clear completed"
                                                                   └─ name + do: button
)
```

---

## Operator Usage Comparison

| Operator | Counter | Todo |
|---|---|---|
| `name` | 3× | ~12× |
| `group` | 1× | 4× |
| `both` | — | 2× (checkbox = see + do) |
| `bind` | — | 2× (add form, edit form) |
| `each` | — | 1× (todo list) |
| `pick` | — | 1× (filter selector) |
| `when` | — | 1× (edit mode) |

The counter uses 2 of 7 operators. The todo app uses all 7. That's a precise measure of complexity.

---

## The Rosetta Stone: Trace Patterns → Operators

| Pattern in trace | Operator | Component |
|---|---|---|
| `name == value` (assertion) | `see` + `name` | labeled display |
| `action()` (no args) | `do` + `name` | labeled button |
| `action("text")` (text arg) | `bind(give(text), do)` | form (text input + submit) |
| `action(i_collection)` (index arg) | `each(collection, ...)` | list with per-item controls |
| `action(:enumVal)` (enum arg) | `pick(do(a₁), ..., do(aₙ))` | selector / tabs |
| `actionA(i)` + `actionB(i)` (complementary pair on same state) | `both(see, do)` | checkbox / toggle |
| State that gates visibility (`editingTodo`) | `when(condition, ...)` | conditional rendering |

This table is the core of synthesis. Read a trace, pattern-match against the left column, emit the operator in the middle column, render the component in the right column.

---

## The Assembly Language: Incremental Refinement with Holes

The intent algebra above describes *finished* compositions — fully specified, no ambiguity. But synthesis doesn't start with a finished product. It starts with almost nothing and gradually fills in details. We need a language for the *process* of assembly, where partially-built things have explicit **holes**.

### Operations

| Operation | What it does |
|---|---|
| `newComponent(X)` | Introduces a component `X` with every property unspecified. X has holes for: type, label, associations, action, visibility. |
| `button(X)` | Fills X's type hole: X is a button. (Eliminates: text input, display, checkbox, ...) |
| `textInput(X)` | Fills X's type hole: X is a text input. |
| `display(X)` | Fills X's type hole: X is a display/readout. |
| `label(X, n)` | Fills X's label hole with `n`, drawn from the intent universe. Attaches X to the *idea* of `n`. |
| `associate(X, Y)` | Declares that X and Y are semantically linked — the user should understand them as related. (X submits Y's value, X controls Y's visibility, etc.) |
| `action(X, endpoint)` | Fills X's action hole, drawn from the data universe. Connects X to a concrete state transition or endpoint. |

### A component is a record with holes

```
newComponent(X)
  X = { type: ?, label: ?, assoc: ?, action: ?, visibility: ? }

button(X)
  X = { type: Button, label: ?, assoc: ?, action: ?, visibility: ? }

label(X, "submit")
  X = { type: Button, label: "submit", assoc: ?, action: ?, visibility: ? }

newComponent(Y)
  Y = { type: ?, label: ?, assoc: ?, action: ?, visibility: ? }

textInput(Y)
  Y = { type: TextInput, label: ?, assoc: ?, action: ?, visibility: ? }

label(Y, "bio")
  Y = { type: TextInput, label: "bio", assoc: ?, action: ?, visibility: ? }

associate(X, Y)
  X = { type: Button, label: "submit", assoc: {Y}, action: ?, visibility: ? }
  Y = { type: TextInput, label: "bio", assoc: {X}, action: ?, visibility: ? }

action(X, POST /bios)
  X = { type: Button, label: "submit", assoc: {Y}, action: POST /bios, visibility: ? }
```

Each `?` is a hole. Each operation fills exactly one hole (or adds a relation). The search space is the product of all remaining holes' possible values.

### Three universes, three kinds of holes

The holes live in different universes, and values that fill them are sourced from different universes:

| Hole | Lives in | Filled from | Examples |
|---|---|---|---|
| type | Widget universe | Widget universe | button, textInput, display |
| label | Widget ↔ Intent boundary | Intent universe | "submit", "increment", "bio", "task" |
| association | Widget ↔ Widget | Widget universe (relational) | associate(X, Y) |
| action | Widget ↔ Data boundary | Data universe | POST /bios, state transition |
| visibility | Widget ↔ Data boundary | Data universe (predicates) | when(editing), always |

The universes constrain each other:

- **Widget type constrains intent**: A `button` can hold `do(a)` but not `see(v)`. A `display` can hold `see(v)` but not `do(a)`.
- **Intent constrains data**: The label "submit" implies a state transition. The label "bio" implies a string-typed value.
- **Data constrains widget**: If an action takes a `string` argument, there must be a `textInput` somewhere, and an `associate` linking them.
- **Association constrains layout**: `associate(X, Y)` means X and Y must be presented so the user grasps their semantic link.

### Synthesis = filling holes consistently across all three universes

Given a partial assembly (some holes filled by the user via traces or explicit specification), synthesis searches over completions that are *consistent*: every hole is filled with a value from the right universe, and the cross-universe constraints all hold.

Traces are observations that constrain the search:

```
addTodo("Buy milk")
```

This single line tells synthesis:
- There exists a component with action `addTodo` (data universe)
- That action takes a string argument, so there's a `textInput` somewhere (widget universe)
- The text input and the action-triggering component are `associate`d (widget universe)
- The action is labeled something like "add" or "submit" (intent universe)
- The text input is labeled something like "task" or "todo" (intent universe)

Each trace line eliminates swaths of the search space.

### Assembly language ↔ intent algebra

These are dual perspectives on the same thing:

| Intent algebra (finished) | Assembly language (process) |
|---|---|
| `name("submit", do(addTodo))` | `newComponent(X); button(X); label(X, "submit"); action(X, addTodo)` |
| `name("task", give(text))` | `newComponent(Y); textInput(Y); label(Y, "task")` |
| `bind(give(text), do(addTodo))` | `associate(X, Y)` |
| `see(count)` | `newComponent(Z); display(Z); label(Z, "count"); action(Z, read(count))` |

The intent algebra is declarative — it says what the finished composition *is*. The assembly language is operational — it says how you *get there*, step by step, with explicit holes at each stage.

A fully assembled widget tree (no `?`s) corresponds exactly to a fully composed intent tree. A partially assembled tree (some `?`s) corresponds to a *family* of intent trees — the search space.

### Worked example: building the bio form step by step

```
newComponent(X)       -- X is something. Could be anything.
newComponent(Y)       -- Y is something. Could be anything.
                      -- Search space: huge. Two unknown components, unrelated.

button(X)             -- X is a button. It triggers something unknown.
textInput(Y)          -- Y is a text input. It supplies text for unknown purpose.
                      -- Search space: smaller. We know the types. But they're
                      -- still unrelated — X might trigger "delete" while Y
                      -- supplies a search query.

label(X, "submit")    -- X is a submit button. The idea of "submit" (from the
                      -- intent universe) attaches to X. This isn't just a
                      -- display string — it carries semantic weight. "Submit"
                      -- implies there's something TO submit.
label(Y, "bio")       -- Y supplies bio text. The idea of "bio" attaches to Y.
                      -- Search space: much smaller. But X and Y are still
                      -- formally independent — X could submit something else.

associate(X, Y)       -- NOW we know: what X submits is what Y supplies.
                      -- "Submit" + "bio" + association = "submit a bio."
                      -- This is the moment the form emerges. Without
                      -- associate, they're two labeled widgets. With it,
                      -- they're a form.
                      -- Search space: tiny. Just need the endpoint.

action(X, POST /bios) -- X triggers POST /bios with Y's value as the body.
                      -- Search space: zero. Fully specified.
```

### Worked example: building a counter

```
newComponent(D)       -- unknown
newComponent(A)       -- unknown
newComponent(B)       -- unknown

display(D)            -- D shows a value
button(A)             -- A triggers something
button(B)             -- B triggers something

label(D, "count")     -- D shows the count
label(A, "increment") -- A triggers increment
label(B, "decrement") -- B triggers decrement

action(D, read(count))      -- D reads from count state
action(A, mutate(count, +1)) -- A increments count
action(B, mutate(count, -1)) -- B decrements count
```

No `associate` needed — the buttons don't take input from another component. No `each`, `pick`, or `when`. The counter's simplicity shows up as fewer operations and no relational operations.

### Worked example: building the todo filter

```
newComponent(F1)
newComponent(F2)
newComponent(F3)

button(F1); button(F2); button(F3)

label(F1, "All")
label(F2, "Active")
label(F3, "Completed")

action(F1, setFilter(:all))
action(F2, setFilter(:active))
action(F3, setFilter(:completed))

pick(F1, F2, F3)      -- mutual exclusion: exactly one is active at a time
```

Here `pick` appears as an assembly operation — it's a *structural* constraint on the relationship between F1, F2, F3. It doesn't fill a hole in any single component; it adds a constraint across components. This is like `associate` but for mutual exclusion rather than value-passing.
