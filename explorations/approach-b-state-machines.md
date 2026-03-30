# Approach B: Abstract State Machine / Labeled Transition System

## Overview

The abstract application is a **labeled transition system** (LTS). States are data configurations. Transitions are user actions (labeled with action names + arguments). Traces are paths through the LTS. The abstract application is the *minimal LTS consistent with all traces*.

This is the most "executable" framing — the abstract application literally *is* a runnable state machine. You can simulate it, check properties, and map it to any modality.

## Phase 1: Traces Define Paths

Each trace is a path from the initial state through a sequence of transitions:

### Counter

```
Path: s0 --increment()--> s1 --decrement()--> s2

s0 = { count: 0 }
s1 = { count: 1 }
s2 = { count: 0 }
```

Note s0 == s2 (same state). So the LTS has a cycle:

```
     increment()         decrement()
s0 ←─────────────── s0 ───────────────→ s0
         ↑                    │
         │    increment()     │
         s(-1) ←── ... ──→ s(n)
```

Actually, the trace only shows us two states. But we must *generalize*: does the counter go to -1? Can it go to 2? The trace doesn't say. This is an inference problem (see "Where It Breaks Down").

### Todo App (trace 2: add one todo)

```
Path: s0 --addTodo("Buy milk")--> s1

s0 = { todos: [], filter: all, editingTodo: nil, editDraft: nil }
s1 = { todos: [Todo(active, "Buy milk")], filter: all, editingTodo: nil, editDraft: nil }
```

### Todo App (trace 5: complete and reopen)

```
Path: s0 --addTodo("Buy milk")--> s1 --markDone(0)--> s2 --markUndone(0)--> s3

s0 = { todos: [] }
s1 = { todos: [Todo(active, "Buy milk")] }
s2 = { todos: [Todo(completed, "Buy milk")] }
s3 = { todos: [Todo(active, "Buy milk")] }
```

s1 == s3 (another cycle).

## Phase 2: LTS Construction

### Formal Definition

```
LTS = (S, s₀, Σ, δ, obs)

where:
  S     = set of states (data configurations)
  s₀    = initial state
  Σ     = action alphabet (action names + argument types)
  δ     = transition function: S × Σ → S
  obs   = observation function: S → Map<Name, Value>
```

### Counter LTS

```
S   = { { count: n } | n ∈ ℤ }      (generalized from traces)
s₀  = { count: 0 }
Σ   = { increment(), decrement() }
δ   = { (s, increment()) → { count: s.count + 1 },
        (s, decrement()) → { count: s.count - 1 } }
obs = { count: s.count }
```

### Todo LTS (core)

```
S   = { { todos: List<Todo>, filter: Filter, editingTodo: Nat?, editDraft: String? } }
s₀  = { todos: [], filter: all, editingTodo: nil, editDraft: nil }
Σ   = { addTodo(s: String), markDone(i: Nat), markUndone(i: Nat),
        removeTodo(i: Nat), setFilter(f: Filter), markAllDone(),
        markAllUndone(), clearCompleted(), startEditing(i: Nat),
        setEditLabel(s: String), saveEdit(), cancelEdit() }

δ(s, addTodo(text)) =
  let trimmed = trim(text) in
  if trimmed == "" then s
  else { ...s, todos: s.todos ++ [Todo(active, trimmed)] }

δ(s, markDone(i)) =
  let real_i = visibleIndex(s, i) in
  { ...s, todos: s.todos[real_i].status := completed }

δ(s, setFilter(f)) = { ...s, filter: f }

% ... etc for each action

obs(s) = {
  todos: s.todos,
  filter: s.filter,
  visibleTodos: filter_by(s.todos, s.filter),
  remainingCount: count(s.todos, λt. t.status == active),
  completedCount: count(s.todos, λt. t.status == completed),
  allCompleted: s.todos ≠ [] ∧ remainingCount == 0,
  canClearCompleted: completedCount > 0,
  editingTodo: s.editingTodo,
  editDraft: s.editDraft
}
```

### Trace Validation

A trace is valid iff it's a path through the LTS where every assertion matches the observation function:

```
validate(trace, lts):
  s = lts.s₀
  for each line in trace:
    if line is "action(args)":
      s = lts.δ(s, action(args))
    if line is "prop == value":
      assert lts.obs(s).prop == value
```

This is directly checkable. You can *run* the abstract application against every trace and verify it passes.

## Phase 3: Modality-Independence

The LTS is genuinely modality-independent. The same LTS maps to different presentations:

### Web UI
- Each observable → a DOM element displaying the value
- Each action with no args → a button
- Each action with args → a form
- State changes → re-render

### Voice Menu (IVR)
- obs(s) → "You have {remainingCount} remaining tasks. {for each visibleTodo: task {i}: {label}, {status}}."
- Σ → "Press 1 to add a task. Press 2 to mark a task done. Press 3 to filter."
- addTodo → "Please say the task name after the beep."
- markDone(i) → "Which task number?"

### Paper Form System
- obs(s) → a printed form showing current state
- Each action → a form field or checkbox on a new form to submit
- δ → the clerk processes the submitted form and produces a new printout

### CLI
- obs(s) → printed output
- Σ → commands: `add "Buy milk"`, `done 0`, `filter active`
- δ → read-eval-print loop

The *logic* is identical in all four. Only the presentation layer differs. That's the value of the LTS as the abstract application.

## Phase 4: Widget Assembly = Rendering Transitions as Affordances

Given an LTS + a target modality, widget assembly maps:

```
For each o in obs(s):
  emit a display widget for o

For each action a in Σ:
  if arity(a) == 0:
    emit a labeled button for a
  if arg_type(a, 0) == string:
    emit a form (text input + submit button) for a
  if arg_type(a, 0) == index(collection):
    emit a per-item control inside a list over collection
  if arg_type(a, 0) == enum(values):
    emit a selector over values
```

This is the same mapping as in Approach A, but derived from the LTS structure rather than raw constraints.

### Per-item actions and the "screen" question

In a simple LTS, every state maps to one "screen." But the todo app shows that some transitions only make sense *in context of a list item*. `markDone(0)` means "mark the first visible todo done" — it only makes sense when there are visible todos.

This suggests the widget assembly needs to understand **affordance availability**: not every action is available in every state. The LTS encodes this implicitly (δ is partial — `markDone(0)` is undefined when visibleTodos is empty), and the UI should reflect it (hide or disable the button).

## Concrete Logic Program: LTS Simulation

```prolog
%% Counter LTS
initial_state(counter, state(0)).

transition(counter, state(Count), increment, state(Count1)) :-
    Count1 is Count + 1.
transition(counter, state(Count), decrement, state(Count1)) :-
    Count1 is Count - 1.

observe(counter, state(Count), count, Count).

%% Trace validation
validate_trace(App, [], State) :- true.
validate_trace(App, [action(A) | Rest], State) :-
    transition(App, State, A, NextState),
    validate_trace(App, Rest, NextState).
validate_trace(App, [assert(Prop, Value) | Rest], State) :-
    observe(App, State, Prop, Value),
    validate_trace(App, Rest, State).

%% Test: counter trace
?- initial_state(counter, S0),
   validate_trace(counter, [
     assert(count, 0),
     action(increment),
     assert(count, 1),
     action(decrement),
     assert(count, 0)
   ], S0).
%% Should succeed.

%% Todo LTS (fragment)
initial_state(todo, state([], all, nil, nil)).

transition(todo, state(Todos, Filter, ET, ED), addTodo(Text), state(NewTodos, Filter, ET, ED)) :-
    atom_string(Text, S), normalize_space(string(Trimmed), S),
    Trimmed \= "",
    append(Todos, [todo(active, Trimmed)], NewTodos).

transition(todo, state(Todos, Filter, ET, ED), markDone(I), state(NewTodos, Filter, ET, ED)) :-
    visible_todos(Todos, Filter, Visible),
    nth0(I, Visible, _OrigIdx-_Todo),  % Visible carries original indices
    set_status(Todos, I, completed, NewTodos).

observe(todo, state(Todos, _, _, _), todos, Todos).
observe(todo, state(Todos, _, _, _), remainingCount, N) :-
    include([todo(active,_)]>>true, Todos, Active),
    length(Active, N).

visible_todos(Todos, all, Todos).
visible_todos(Todos, active, Filtered) :-
    include([todo(active,_)]>>true, Todos, Filtered).
visible_todos(Todos, completed, Filtered) :-
    include([todo(completed,_)]>>true, Todos, Filtered).
```

## Where It Breaks Down

1. **State space explosion.** The counter has infinite states (all integers). The todo app has *vastly* more (arbitrary lists of arbitrary strings). The LTS is a conceptual tool, not something you can enumerate. You need symbolic representation (which is basically... a program).

2. **Generalization.** The traces show specific paths. The LTS must generalize: `addTodo` works for *any* string, `markDone` works for *any* valid index. Constructing δ from example paths requires inductive generalization — the same hard problem as in Approach A.

3. **Continuous/intermediate state.** The LTS is discrete: state → action → state. But real UIs have continuous intermediate states: the user is *typing* in a text input, the cursor is at position 3, they've typed "Buy". The LTS only sees the completed action `addTodo("Buy milk")`. This is fine for the abstract application (which is intentionally coarse-grained) but means the widget layer must add its own micro-state.

4. **Concurrency.** The LTS is sequential — one action at a time. Real UIs can have concurrent interactions (typing in one field while an animation plays, or two users editing simultaneously). The LTS would need to become a concurrent model (Petri net, process algebra) to handle this, adding significant complexity.

5. **Derived state is implicit.** The `obs` function computes `visibleTodos`, `remainingCount`, etc., but the LTS formalism doesn't distinguish between stored and derived state. This distinction matters for widget assembly (derived state drives display; stored state drives controls).

## Where Generative AI Plugs In

1. **Inferring δ from traces.** "Given these input-output examples, write the transition function" is a natural code-generation task.

2. **Phase 5: Code generation from LTS.** The LTS is essentially a complete functional spec. An LLM can generate a React app, a Flask server, a CLI tool, etc. from it. The LTS is a much better prompt than the raw traces because it's already generalized and formalized.

3. **Checking AI-generated code against the LTS.** Since the LTS is executable, you can run the generated app's behavior through the same trace validation. If the generated React app doesn't match the LTS on all traces, regenerate. This is the "checkable abstract spec" idea — the LTS is the oracle.

## Comparison with Approach A

Approach A (constraints) and Approach B (LTS) are closely related — the LTS *is* a model that satisfies all the constraints. The difference is emphasis:

- **A** focuses on the *inference* process (how to go from traces to model)
- **B** focuses on the *model itself* (what the abstract application looks like)

They're complementary. Use A's techniques to build B's model.
