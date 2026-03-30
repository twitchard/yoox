# Approach A: Constraint / Logic-Programming

## Overview

Traces are logical constraints. Synthesis is constraint satisfaction. Each trace line narrows the space of valid abstract applications. The system is a logic program: you assert facts from traces, define rules for what constitutes a well-formed application, and query for solutions.

## Phase 1: Traces as Constraints

Each trace line generates one or more logical facts:

```prolog
%% From: count == 0;
observable(count).
initial_value(count, 0).
type(count, integer).

%% From: increment();
action(increment).
arity(increment, 0).

%% From: count == 1; (after increment)
causes(increment, count, 1).  % in the context where count was 0

%% From: decrement();
action(decrement).
arity(decrement, 0).

%% From: count == 0; (after decrement from 1)
causes(decrement, count, 0).  % in the context where count was 1
```

For the todo app, richer constraints emerge:

```prolog
%% From: addTodo("Buy milk");
action(addTodo).
arity(addTodo, 1).
arg_type(addTodo, 0, string).

%% From: todos == [Todo(:active, "Buy milk")];
observable(todos).
type(todos, list(todo)).
entity(todo).
entity_field(todo, status, enum([active, completed])).
entity_field(todo, label, string).

%% From: markDone(0_visibleTodo);
action(markDone).
arity(markDone, 1).
arg_type(markDone, 0, index(visibleTodos)).

%% From: setFilter(:active);
action(setFilter).
arity(setFilter, 1).
arg_type(setFilter, 0, enum([all, active, completed])).

%% From: remainingCount == 1; (in multiple contexts)
observable(remainingCount).
type(remainingCount, integer).
derived(remainingCount).  % because it's never directly mutated
```

## Phase 2: Data Model Inference

Rules infer the data model from accumulated facts:

```prolog
%% An entity exists if it appears as a type constructor
entity(E) :- type(_, list(E)).
entity(E) :- type(_, E), \+ primitive(E).

%% A field exists if trace assertions access it
entity_field(E, F, T) :-
    trace_assertion(Path, Value),
    path_entity(Path, E),
    path_field(Path, F),
    infer_type(Value, T).

%% A derived property is one that's observed but never directly set
derived(Prop) :-
    observable(Prop),
    \+ (action(A), directly_sets(A, Prop)).

%% Infer derivation rules from co-occurrences across traces
%% e.g., remainingCount always equals count of active todos
derivation_rule(remainingCount, count(todos, status == active)) :-
    forall(trace(T),
        (trace_value(T, remainingCount, N),
         trace_value(T, todos, Todos),
         count_where(Todos, status == active, N))).
```

### Counter data model (inferred):

```
Entity: (none — just a scalar)
State: { count: integer }
Initial: { count: 0 }
Actions: increment() → count := count + 1
         decrement() → count := count - 1
Derived: (none)
```

### Todo data model (inferred):

```
Entity: Todo { status: enum(active, completed), label: string }
State: { todos: list(Todo), filter: enum(all, active, completed) }
Initial: { todos: [], filter: all }
Actions: addTodo(s: string) → todos := todos ++ [Todo(active, trim(s))]
         markDone(i: index) → todos[i].status := completed
         markUndone(i: index) → todos[i].status := active
         removeTodo(i: index) → todos := remove(todos, i)
         setFilter(f: enum) → filter := f
         markAllDone() → forall t in todos: t.status := completed
         markAllUndone() → forall t in todos: t.status := active
         clearCompleted() → todos := filter(todos, status != completed)
         startEditing(i: index) → editingTodo := i
         setEditLabel(s: string) → editDraft := s
         saveEdit() → todos[editingTodo].label := trim(editDraft); editingTodo := nil
         cancelEdit() → editingTodo := nil
Derived: visibleTodos = filter(todos, filter)
         remainingCount = count(todos, status == active)
         completedCount = count(todos, status == completed)
         allCompleted = (todos != [] and remainingCount == 0)
         canClearCompleted = completedCount > 0
```

## Phase 3: Abstract Application (Constraint Solution)

The abstract application is the *minimal model* satisfying all constraints. It's a structure:

```
AbstractApp = {
  state: Map<Name, Type>,
  initial: Map<Name, Value>,
  actions: Map<Name, { args: List<(Name, Type)>, effect: StateTransition }>,
  derived: Map<Name, Expression>,
  invariants: List<Predicate>   % from assertions that hold across all traces
}
```

This is modality-independent. It says nothing about buttons, screens, or voice prompts. It says: "there is state, there are actions that transform state, there are derived views of state."

A phone menu could expose `addTodo` as "Press 1 to add a task, then speak the task name." A website exposes it as a text input + submit button. The abstract application doesn't care.

## Phase 4: Widget Assembly as Further Constraint Satisfaction

Given an abstract application + a target modality (e.g., "web"), widget assembly is another round of constraint satisfaction:

```prolog
%% Rules for web modality

%% An observable needs a display widget
needs_widget(Obs, display) :- observable(Obs), \+ derived_list(Obs).
needs_widget(Obs, list) :- observable(Obs), type(Obs, list(_)).

%% A no-arg action needs a button
needs_widget(Act, button) :- action(Act), arity(Act, 0).

%% A string-arg action needs a form (text input + submit)
needs_widget(Act, form) :- action(Act), arity(Act, 1), arg_type(Act, 0, string).
needs_form_child(Act, text_input) :- needs_widget(Act, form).
needs_form_child(Act, submit_button) :- needs_widget(Act, form).

%% An index-arg action needs to be inside a list item
needs_per_item(Act) :- action(Act), arg_type(Act, _, index(_)).

%% An enum-arg action needs a selector
needs_widget(Act, selector) :- action(Act), arg_type(Act, _, enum(_)).

%% Complementary actions on same state → toggle/checkbox
needs_widget(toggle(A1, A2), checkbox) :-
    action(A1), action(A2),
    modifies_same_field(A1, A2),
    effect(A1, Field, V1), effect(A2, Field, V2),
    complementary(V1, V2).
```

### Solving for the counter:

```prolog
?- needs_widget(X, W).
X = count, W = display.
X = increment, W = button.
X = decrement, W = button.
```

Three widgets. Done.

### Solving for the todo app (partial):

```prolog
?- needs_widget(X, W).
X = addTodo, W = form.
X = setFilter, W = selector.
X = clearCompleted, W = button.
X = toggle(markDone, markUndone), W = checkbox.  % per-item
X = toggle(markAllDone, markAllUndone), W = checkbox.  % top-level
X = removeTodo, W = button.  % per-item
X = remainingCount, W = display.
X = completedCount, W = display.
% ... etc

?- needs_per_item(X).
X = markDone.
X = markUndone.
X = removeTodo.
X = startEditing.
```

## Where It Breaks Down

1. **Layout.** Constraint satisfaction tells you *what* widgets you need but not *where* to put them. "group these together" is underconstrained — there are many valid layouts. You need heuristics or additional constraints (proximity, information architecture conventions).

2. **Generalization from traces.** The traces show `addTodo("Buy milk")` and `addTodo("Walk dog")`. The system must generalize: `addTodo` takes *any* string, not just these two. For simple types this is fine. For complex behaviors (e.g., "empty edit deletes todo"), the generalization from examples to rules is the hard part.

3. **Derived property inference.** Figuring out that `remainingCount = count(todos where status == active)` from observing it across traces is essentially inductive synthesis. It works for simple arithmetic relationships but gets combinatorially hard for complex derived state.

4. **Ambiguity.** Some traces are consistent with multiple abstract applications. `increment(); count == 1` could mean `count := count + 1` or `count := 1` (if we only see it from state 0). More traces disambiguate, but the user might not provide enough.

## Where Generative AI Plugs In

1. **Generalization from traces** — LLMs are good at inferring "the general rule" from a few examples. "Given these trace lines, what's the general semantics of `addTodo`?" is a natural-language inductive synthesis task.

2. **Layout** — Given a set of required widgets and their relationships, an LLM can propose a reasonable layout. This is where conventional constraint solving struggles.

3. **Phase 5: Renderable product** — The abstract application (state + actions + derived) is a clean spec. Hand it to an LLM with "implement this as a React app" and it has everything it needs: state shape, action semantics, derived computations, and widget requirements.

4. **Incremental updates** — When a trace changes, the constraint system can recompute the minimal diff to the abstract application. That diff (e.g., "added action `archiveTodo` with same signature as `removeTodo` but sets `status := archived` instead of deleting") is a focused prompt for the LLM to update the rendered product.
