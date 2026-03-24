# Intent Decomposition / Component Composition: Worked Examples

## Primitive Components and Their Generic Intents

Before looking at any specific app, we need the truly primitive building blocks. Each has a *generic* intent — it doesn't know what app it's in.

| Primitive | Generic intent |
|---|---|
| **button** | "trigger something" |
| **text input** | "supply text" |
| **label** | "name a thing" / "describe a thing" |
| **display** | "observe a value" |
| **checkbox** | "toggle a boolean" |
| **list** | "repeat something for each item in a collection" |

These are maximally generic. A bare button doesn't know *what* it triggers. A bare text input doesn't know *what* the text is for. Meaning comes from composition.

## Composition Operators

The interesting part: how generic intents become specific.

### Labeling: generic → specific

A **label** applied to a component narrows its intent:

```
label("increment") + button
  "name a thing"   + "trigger something"
  ────────────────────────────────────────
  = labeled button: "trigger increment"
```

The label is doing real semantic work. "Trigger something" is useless. "Trigger increment" is a real user intent. The label is the bridge.

Similarly:

```
label("count") + display(0)
  "name a thing" + "observe a value"
  ──────────────────────────────────
  = labeled display: "observe the count"
```

### Grouping: parts → whole

Placing components next to each other in a group creates a composite intent:

```
labeled-display("count", 0) + labeled-button("increment") + labeled-button("decrement")
  "observe the count"       + "trigger increment"          + "trigger decrement"
  ──────────────────────────────────────────────────────────────────────────────────
  = counter widget: "track and adjust a count"
```

### Form: text input + submit → "submit specified information"

A **form** is a specific composition pattern: one or more labeled inputs + a submit button. It turns "supply text" + "trigger something" into "submit specified information."

```
label("task") + text-input + label("submit") + button
  "name"      + "supply text" + "name"       + "trigger something"
  ──────────────────────────────────────────────────────────────────
  = form: "submit a task description"
```

The form is more than the sum of its parts. A bare text input and a bare button next to each other don't *mean* "submit information." The form pattern — input feeds into the button's action — creates that meaning. The label on the input says *what kind* of information. The button's label can be generic ("submit") or specific ("Add todo").

### Repetition: list + template → "do something for each item"

A **list** takes a component template and repeats it for each item in a collection, binding each instance to an item:

```
list(todos) + todo-item-template
  "repeat for each" + "see and act on one todo"
  ──────────────────────────────────────────────
  = todo list: "see and act on all todos"
```

Each repeated instance gets an item index, which is how per-item actions (`markDone(0_visibleTodo)`) know which item they target.

### Conditional: mode guard → "do this only when..."

A **conditional** shows a component only when some condition holds:

```
when(editingTodo != nil) + edit-overlay
  "only when editing"    + "edit a todo's label"
  ─────────────────────────────────────────────
  = conditional edit: "edit a todo's label (when in edit mode)"
```

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

### Intent Decomposition (top-down)

The user wants to **track and adjust a count**:

```
track and adjust a count
├── observe the current count
├── increase the count
└── decrease the count
```

### Component Composition (bottom-up)

Start from the primitives and build up:

**Layer 0 — bare primitives:**
- `display` — "observe a value"
- `button` — "trigger something"
- `button` — "trigger something"

These are meaningless on their own. Three widgets with no specific purpose.

**Layer 1 — labeling gives meaning:**
- `label("count") + display(count)` → "observe the count"
- `label("increment") + button(increment)` → "trigger increment" = "increase the count"
- `label("decrement") + button(decrement)` → "trigger decrement" = "decrease the count"

Now each component has a specific intent. The label did all the work.

**Layer 2 — grouping gives wholeness:**
- group all three → **counter widget** → "track and adjust a count"

```
counter widget                                     ← "track and adjust a count"
├── label("count") + display(count)                ← "observe the count"
├── label("increment") + button(increment)         ← "increase the count"
└── label("decrement") + button(decrement)         ← "decrease the count"
```

### What synthesis infers from the trace

The trace gives us:
- `count == 0` / `count == 1` → there's an observable called `count` (numeric)
- `increment()` → there's a no-arg action called `increment`
- `decrement()` → there's a no-arg action called `decrement`

Synthesis assigns components:
- Observable → display primitive
- No-arg action → button primitive
- Names (`count`, `increment`, `decrement`) → labels

That's the whole story. The counter is one layer of labeling + one grouping.

---

## 2. Todo App

### Intent Decomposition (top-down)

```
manage a list of tasks
├── add a task
│   ├── describe the task (supply text)
│   └── submit
├── view tasks
│   ├── see each task (label + status)
│   ├── see summary (remaining count, completed count)
│   └── see which filter is active
├── act on a single task
│   ├── toggle its completion
│   ├── remove it
│   └── edit its label
│       ├── enter edit mode
│       ├── type new label
│       └── confirm or cancel
├── act on all tasks
│   ├── mark all done / undone
│   └── clear completed
└── filter tasks
    └── select: all | active | completed
```

### Component Composition (bottom-up)

Here the layering is richer, because composition operators beyond labeling come into play.

**Layer 0 — bare primitives:**

We need: displays, buttons, text inputs, checkboxes, a list. All generic, no meaning yet.

**Layer 1 — labeling gives meaning:**

```
label("task") + text-input              → "describe a task"
label("Add") + button                   → "trigger add"
label("count") + display(remainingCount)→ "observe remaining count"
label("Delete") + button                → "trigger delete"
label("All") + button                   → "trigger show-all"
label("Active") + button                → "trigger show-active"
label("Completed") + button             → "trigger show-completed"
label("Clear completed") + button       → "trigger clear-completed"
checkbox + label(todo.label)            → "toggle completion of [this task]" + "see [this task]"
```

Each component now has a specific intent, but they're still independent pieces.

**Layer 2 — form composition ("submit specified information"):**

```
(label("task") + text-input) + (label("Add") + button)
  "describe a task"          + "trigger add"
  ───────────────────────────────────────────────
  = new-todo form: "submit a new task"
```

This is the key move. The form pattern binds the text input's value to the button's action. "Describe a task" + "trigger add" fuse into "add a described task." Neither piece means this alone.

Similarly for editing:

```
(text-input(editDraft)) + (save-on-enter) + (cancel-on-escape)
  "supply replacement text" + "confirm" + "cancel"
  ─────────────────────────────────────────────────
  = edit form: "submit an edited label, or cancel"
```

**Layer 3 — per-item composition (grouping within a repeated context):**

```
checkbox(todo.status) + label(todo.label) + labeled-button("Delete", removeTodo)
  "toggle this task's completion" + "see this task" + "remove this task"
  ──────────────────────────────────────────────────────────────────────
  = todo-item: "see and act on one task"
```

Plus a conditional:

```
todo-item + when(editingTodo == this) { edit-form }
  "see and act on one task" + "edit this task's label (when editing)"
  ──────────────────────────────────────────────────────────────────
  = todo-item-with-edit: "fully interact with one task"
```

**Layer 4 — repetition (list of items):**

```
list(visibleTodos) + todo-item-with-edit
  "for each visible todo" + "fully interact with one task"
  ────────────────────────────────────────────────────────
  = todo-list: "see and act on all visible tasks"
```

The list operator does something specific: it binds each instance to an index, which is how `markDone(0_visibleTodo)` knows which item to target.

**Layer 5 — selection composition:**

```
labeled-button("All") + labeled-button("Active") + labeled-button("Completed")
  "trigger show-all"   + "trigger show-active"    + "trigger show-completed"
  ─────────────────────────────────────────────────────────────────────────────
  = filter-bar (selector): "choose which tasks to see"
```

A selector is a group of labeled buttons where exactly one is active. It turns multiple "trigger X" intents into a "choose among X" intent.

**Layer 6 — the whole app (grouping everything):**

```
todo app                                              ← "manage a list of tasks"
├── new-todo form                                     ← "add a task"              [Layer 2: form]
│   ├── label("task") + text-input                    ← "describe a task"         [Layer 1: labeling]
│   └── label("Add") + button(addTodo)                ← "trigger add"             [Layer 1: labeling]
├── toggle-all checkbox                               ← "mark all done/undone"    [Layer 1: labeling]
├── todo-list                                         ← "see and act on all tasks"[Layer 4: repetition]
│   └── todo-item-with-edit (repeated)                ← "interact with one task"  [Layer 3: per-item]
│       ├── checkbox(status)                          ← "toggle completion"        [Layer 1: labeling]
│       ├── label(todo.label)                         ← "see this task"            [Layer 1: labeling]
│       ├── label("Delete") + button(removeTodo)      ← "remove this task"         [Layer 1: labeling]
│       └── when(editing) { edit-form }               ← "edit label (when editing)"[Layer 2: form + conditional]
│           ├── text-input(editDraft)                 ← "type new label"           [Layer 0: primitive]
│           ├── save-on-enter                         ← "confirm"                  [Layer 0: primitive]
│           └── cancel-on-escape                      ← "cancel"                   [Layer 0: primitive]
├── filter-bar                                        ← "choose which tasks to see"[Layer 5: selector]
│   ├── label("All") + button(setFilter(:all))        ← "show all"                [Layer 1: labeling]
│   ├── label("Active") + button(setFilter(:active))  ← "show active"             [Layer 1: labeling]
│   └── label("Completed") + button(setFilter(:done)) ← "show completed"          [Layer 1: labeling]
├── summary-bar                                       ← "see summary"              [Layer 1: labeling]
│   ├── label("remaining") + display(remainingCount)  ← "see remaining count"     [Layer 1: labeling]
│   └── label("completed") + display(completedCount)  ← "see completed count"     [Layer 1: labeling]
└── label("Clear completed") + button(clearCompleted) ← "clear completed"          [Layer 1: labeling]
```

---

## The Composition Operators, Summarized

| Operator | What it does to intent |
|---|---|
| **label** | Narrows a generic intent to a specific one. "Trigger something" → "trigger increment." This is the most fundamental operator — it's how meaning enters the system. |
| **form** | Binds inputs to an action. "Supply text" + "trigger something" → "submit specified information." The binding is the new thing — the text input's value becomes the action's argument. |
| **group** | Juxtaposes intents into a composite. "Observe count" + "trigger increment" + "trigger decrement" → "track and adjust a count." |
| **list (repetition)** | Repeats a template per item. "Interact with one task" → "interact with all tasks." Introduces item indexing. |
| **selector** | Makes a group of triggers mutually exclusive. "Trigger A" + "trigger B" + "trigger C" → "choose among A, B, C." |
| **conditional** | Guards a component behind a condition. "Edit a label" → "edit a label, when in edit mode." |

### Why this matters for synthesis

Given a trace, synthesis must:

1. Identify the **primitives** needed (observables → displays, actions → buttons, text arguments → text inputs, boolean toggles → checkboxes)
2. Apply **labeling** — every name in the trace (`count`, `increment`, `addTodo`) becomes a label that gives a primitive its specific meaning
3. Recognize **form patterns** — when an action takes a text argument (`addTodo("Buy milk")`), that's a text input bound to a button, i.e. a form
4. Recognize **repetition** — when actions take an item index (`markDone(0_visibleTodo)`), there's a list with per-item components
5. Recognize **selection** — when an action takes an enum (`setFilter(:active)`), there's a selector
6. Recognize **modes** — when state guards visibility (`editingTodo != nil`), there's a conditional
7. **Group** everything into the final layout

The key insight: **composition operators are what turn traces into UI**. The trace gives you the primitives and their names. The operators tell you how to wire them together. Each operator corresponds to a specific pattern in the trace language (text arg → form, index arg → list, enum arg → selector, guard condition → conditional, name → label).
