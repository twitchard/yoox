# Intent Decomposition / Component Composition: Worked Examples

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

The user arrives with one goal: **track and adjust a count**.

This is already nearly atomic, but it decomposes into three leaf intents:

```
track and adjust a count
├── observe the current count
├── increase the count
└── decrease the count
```

There's no further decomposition. The trace tells us this directly:
- `count == 0` / `count == 1` → the user *observes* a numeric value
- `increment()` → the user *acts* to increase it
- `decrement()` → the user *acts* to decrease it

### Component Composition (bottom-up)

Each leaf intent is fulfilled by a leaf component:

```
counter widget                    ← fulfills "track and adjust a count"
├── numeric display (count)       ← fulfills "observe the current count"
├── button ("increment")          ← fulfills "increase the count"
└── button ("decrement")          ← fulfills "decrease the count"
```

The mapping is almost trivially 1:1. That's expected — the counter is a simple app.

### What synthesis infers

From the trace, synthesis extracts:
1. **One observable**: `count` (numeric, starts at 0)
2. **Two actions**: `increment()`, `decrement()` (no arguments, no return)
3. **Causal structure**: `increment` makes count go up by 1, `decrement` makes it go down by 1
4. **Intent tree**: flat — one observe, two act

The component tree follows: a display for the observable, a button for each action.

---

## 2. Todo App

### The Traces (summarized)

From `examples.md`, the traces cover: adding todos, completing/reopening, removing, filtering, editing, bulk operations, and edge cases around filtered views.

### Intent Decomposition (top-down)

The user arrives with: **manage a list of tasks**.

```
manage a list of tasks
├── add a task
│   ├── type task text
│   └── submit
├── view tasks
│   ├── see each task (label + status)
│   ├── see summary (remaining count, completed count)
│   └── see which filter is active
├── act on a single task
│   ├── toggle its completion status
│   │   ├── mark done
│   │   └── mark undone
│   ├── remove it
│   └── edit its label
│       ├── enter edit mode
│       ├── type new label
│       └── save or cancel
│           ├── save (applies change, trims, deletes if blank)
│           └── cancel (reverts)
├── act on all tasks
│   ├── mark all done
│   ├── mark all undone
│   └── clear completed
└── filter tasks
    ├── show all
    ├── show active
    └── show completed
```

### How traces map to the intent tree

Each trace exercises a path through this tree:

| Trace | Intent path exercised |
|---|---|
| `addTodo("Buy milk")` | add a task → type text ("Buy milk") → submit |
| `todos == [...]` | view tasks → see each task |
| `remainingCount == 1` | view tasks → see summary |
| `markDone(0_visibleTodo)` | act on single task → toggle status → mark done |
| `startEditing(0_visibleTodo)` | act on single task → edit label → enter edit mode |
| `setEditLabel("...")` | act on single task → edit label → type new label |
| `saveEdit()` | act on single task → edit label → save or cancel → save |
| `cancelEdit()` | act on single task → edit label → save or cancel → cancel |
| `setFilter(:active)` | filter tasks → show active |
| `markAllDone()` | act on all tasks → mark all done |
| `clearCompleted()` | act on all tasks → clear completed |

The full trace suite covers every leaf in the intent tree at least once.

### Component Composition (bottom-up)

Now the dual: build components bottom-up so each fulfills an intent node.

**Leaf components:**

| Component | Fulfills intent |
|---|---|
| text input | "type text" |
| submit trigger (e.g., Enter key) | "submit" |
| label (displays text) | "see a value" |
| checkbox / toggle | "mark done" / "mark undone" |
| delete button | "remove it" |
| inline text input (edit mode) | "type new label" |
| save trigger (Enter / blur) | "save" |
| cancel trigger (Escape) | "cancel" |
| radio / tab button | "show all" / "show active" / "show completed" |
| action button | "mark all done" / "clear completed" etc. |

**Composed components:**

```
todo app                                    ← "manage a list of tasks"
│
├── new-todo input                          ← "add a task"
│   ├── text input (placeholder: task)      ← "type task text"
│   └── submit-on-enter                     ← "submit"
│
├── todo list                               ← "view tasks" + "act on tasks"
│   └── todo item (repeated per visible)    ← "see one task" + "act on one task"
│       ├── checkbox                        ← "toggle completion status"
│       ├── label (task text)               ← "see task label + status"
│       ├── delete button                   ← "remove it"
│       └── edit overlay (conditional)      ← "edit its label"
│           ├── inline text input           ← "type new label"
│           ├── save-on-enter / blur        ← "save"
│           └── cancel-on-escape            ← "cancel"
│
├── filter bar                              ← "filter tasks"
│   ├── tab "All"                           ← "show all"
│   ├── tab "Active"                        ← "show active"
│   └── tab "Completed"                     ← "show completed"
│
├── summary bar                             ← "see summary"
│   ├── remaining count label               ← "see remaining count"
│   └── completed count label               ← "see completed count"
│
└── bulk actions                            ← "act on all tasks"
    ├── toggle-all checkbox                 ← "mark all done" / "mark all undone"
    └── "Clear completed" button            ← "clear completed"
```

### The synthesis problem, concretely

Given the traces, synthesis must:

1. **Extract the intent tree.** The observables (`todos`, `filter`, `remainingCount`, ...) become "observe" leaves. The actions (`addTodo`, `markDone`, `setFilter`, ...) become "act" leaves. The argument structure reveals grouping — `markDone(0_visibleTodo)` acts *on a specific item*, so it's nested under per-item intent. `markAllDone()` takes no item argument, so it's a bulk intent.

2. **Infer the state machine.** From the causal relationships in traces: `addTodo(text)` appends to `todos`, `markDone(i)` changes status at index `i`, `setFilter(f)` changes `filter` and recomputes `visibleTodos`, etc. The derived properties (`remainingCount`, `allCompleted`, `canClearCompleted`) are inferred from assertions that hold across all traces.

3. **Match the component tree.** Each intent node maps to a component from the arsenal. The key insight: **argument structure determines nesting**. Actions that take an item index (`markDone(0_visibleTodo)`) become per-item UI. Actions with no item context (`markAllDone()`) become top-level UI. Actions that take a text argument (`addTodo("Buy milk")`) need a text input. Actions that select from a fixed set (`setFilter(:active)`) need a selector.

### Observations

**The counter is flat.** One level of intent, one level of components. No item indexing, no conditional UI, no modes.

**The todo app has depth.** The intent tree has 4 levels. Key sources of depth:
- **Repetition**: `visibleTodos` is a list → per-item intents → per-item components → a list component
- **Modes**: editing is a conditional mode → the edit overlay only appears when `editingTodo != nil` → modal UI
- **Filtering**: `visibleTodos` is a derived projection → the view depends on `filter` state → the filter bar controls what's visible

**Argument types drive component selection:**
- No args → button (`increment()`, `clearCompleted()`)
- Text arg → text input + submit (`addTodo("Buy milk")`)
- Index arg → per-item control (`markDone(0_visibleTodo)`)
- Enum arg → selector/tabs (`setFilter(:active)`)

**Derived properties drive layout:**
- `remainingCount`, `completedCount` → summary displays
- `canClearCompleted` → conditional visibility of "Clear completed" button
- `allCompleted` → state of toggle-all checkbox
- `visibleTodos` → what appears in the list
