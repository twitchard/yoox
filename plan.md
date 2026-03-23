# Yoox CLI — MVP Interface Plan

## End-to-End Flow

```
trace files (.ux)  →  parse  →  synthesize app model  →  generate code  →  serve/export
```

The CLI needs to support this pipeline. For an MVP, a user should be able to:
1. Write trace files describing their app
2. Run a single command to get a working web app

---

## Commands

### `yoox build <input>`

The core command. Takes a trace file (or directory of trace files) and produces a working web app.

```
yoox build todo.ux                  # single file
yoox build ./traces/                # directory of .ux files
yoox build todo.ux -o ./dist        # specify output directory
yoox build todo.ux --format html    # single self-contained HTML file (default)
yoox build todo.ux --format react   # generate a React project (stretch)
```

**What it does under the hood:**
1. **Parse** — read `.ux` trace files, produce an AST of traces (actions, assertions, state references)
2. **Analyze** — extract state variables, actions, derived properties, and types from the traces
3. **Synthesize** — produce a logical app model (state machine + transition functions)
4. **Generate** — emit a working web app from the model

**Output (MVP):** A single `index.html` with embedded JS and minimal CSS that implements the app.

### `yoox check <input>`

Validate trace files without generating code. Useful during authoring.

```
yoox check todo.ux
```

Reports:
- Parse errors (syntax)
- Consistency errors (e.g., assertion references undefined state, action arity mismatches across traces)
- Warnings (e.g., state declared but never asserted, unreachable actions)

### `yoox dev <input>`

Build + serve with live reload. The happy-path development experience.

```
yoox dev todo.ux                    # serve on localhost:3000
yoox dev todo.ux --port 8080
```

### `yoox inspect <input>`

Show what was inferred from the traces — the synthesized app model — without generating UI. Helps the user understand and debug what Yoox thinks their app is.

```
yoox inspect todo.ux
```

Output something like:
```
State:
  todos: List<Todo>
  filter: :all | :active | :completed
  editingTodo: Int | nil
  editDraft: String | nil

Derived:
  visibleTodos: List<Todo>    = filter(todos, filter)
  remainingCount: Int         = count(todos where status == :active)
  completedCount: Int         = count(todos where status == :completed)
  allCompleted: Bool          = todos != [] and remainingCount == 0
  canClearCompleted: Bool     = completedCount > 0

Actions:
  addTodo(label: String)
  markDone(index: Int)
  markUndone(index: Int)
  markAllDone()
  markAllUndone()
  removeTodo(index: Int)
  setFilter(f: Filter)
  clearCompleted()
  startEditing(index: Int)
  setEditLabel(label: String)
  saveEdit()
  cancelEdit()

Routes:
  GET /
```

---

## Trace File Format (`.ux`)

Based on what's already in README/examples, but needs to be pinned for parsing:

```
# Comments start with hash
!GET /                              # route directive
todos == [];                        # assertion (state == value)
addTodo("Buy milk");                # action call
todos == [Todo(:active, "Buy milk")]; # assertion after action
```

**Key syntax elements to parse:**
- `!VERB /path` — route declarations
- `identifier == expr;` — state assertions
- `identifier(args...);` — action invocations
- `Todo(:symbol, "string")` — data constructors
- `N_collection` — indexed references (e.g., `0_visibleTodo`)
- `:symbol` — enum/tag values
- `nil` — null value
- Expressions: list literals `[...]`, member access `.`, boolean/numeric literals

---

## Internal Pipeline (stub boundaries)

These are the module boundaries the CLI commands call into:

```
src/
  cli.ts              # argument parsing, command dispatch
  parse/
    lexer.ts          # tokenize .ux files
    parser.ts         # produce trace AST
    ast.ts            # AST type definitions
  analyze/
    extract.ts        # extract state vars, actions, types from traces
    check.ts          # consistency validation, error reporting
    model.ts          # app model type definitions (state machine)
  synthesize/
    synthesize.ts     # traces + extracted info → app model
  generate/
    html.ts           # app model → single-file HTML
  dev/
    server.ts         # local dev server with file watching + live reload
```

---

## MVP Scope / Non-goals

**In scope for MVP:**
- Parse the trace syntax from README/examples
- Extract state, actions, derived properties
- Generate a single self-contained HTML file with vanilla JS
- `build`, `check`, `inspect` commands
- `dev` server (simple — just serve the built file + watch for changes)

**Not in scope for MVP:**
- Multi-page / routing (only `GET /` for now)
- React/Vue/framework code generation
- Persistent storage / backend
- CSS customization or theming
- Constraint solving / SMT-based synthesis (MVP can use simpler heuristic synthesis)
- NPM package publishing
