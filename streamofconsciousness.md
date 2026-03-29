# Stream of Consciousness: Widget Assembly as Search Space

## The Core Intuition (from conversation, March 2025)

> newComponent(X) # adds a component X of unspecified type
> newComponent(Y) # ...
> button(X) # adds X as an unlabeled button
> textInput(Y) # ...
> label(X, "submit") # attaches X to the idea of "submit" --- not sure if there is a separate algebra for the domain of ideas / intents. The "universe" of widget assembly I think of as separate but related to the "universe" of intent evolution plus data definition, in a sense related to how the world of types is separate/related to the world of values is separate/related to the world of kinds
>
> label(Y, "bio")
> associate(X, Y) # this relation signifies that X and Y should be visually (or otherwise) presented in such a way that the user understands that the object of "submit" when clicking X is the value of Y
>
> action(X, "POST /bios") # attaches the submit button to a particular endpoint. Probably instead of free text an endpoint would be a structured object with a schema.
>
> so the goal of this kind of widget assembly language is as a DSL for defining a search space for synthesis. Basically, the partially assembled widgets have "holes" -- an unlabeled button has a hole to get a label, (and an appropriate label can be sourced from the universe of intents/data definitions), an unassociated text input has a hole for something that can transmit that text input somewhere (maybe a submit button, maybe an autosubmitting form widget, maybe some completely client-side component)

## Three Universes

The analogy to types/values/kinds is pointing at something important. There are three separate-but-related domains:

1. **Widget universe** — structural. What components exist, what type they are, how they're spatially/visually associated. Operations: newComponent, button, textInput, associate, group, etc.

2. **Intent universe** — semantic. What purposes exist, how they decompose, what names they carry. This is where "submit" lives as an *idea* before it gets attached to a button. Operations: decompose, name, refine.

3. **Data universe** — schemas, endpoints, state shapes. Where "POST /bios" and "{ bio: string }" live. Operations: defineEndpoint, defineSchema, etc.

These are related the way types/values/kinds are:
- The intent universe *classifies* widgets (a button *has kind* "action trigger")
- The data universe *types* the values flowing through widgets (a text input *has type* string)
- The widget universe *instantiates* intents as concrete interactive things

`label(X, "submit")` crosses from the widget universe into the intent universe — it attaches the idea "submit" to a concrete widget. `action(X, "POST /bios")` crosses from the widget universe into the data universe — it attaches a concrete endpoint to a widget. `associate(X, Y)` stays within the widget universe — it's purely structural/relational.

## Holes and Search Spaces

The key reframe: the assembly language isn't for *defining* UIs. It's for *constraining the search space* that synthesis explores.

A fully unspecified component has maximum holes:

```
newComponent(X)
  X : { type: ?, label: ?, associations: ?, action: ?, value: ?, visibility: ? }
```

Every `?` is a hole. Every operation fills a hole and shrinks the search space:

```
button(X)              →  type := Button         (eliminates textInput, display, checkbox, ...)
label(X, "submit")     →  label := "submit"      (eliminates "increment", "delete", "cancel", ...)
associate(X, Y)        →  associations += Y      (constrains layout, semantics)
action(X, POST /bios)  →  action := POST /bios   (eliminates other endpoints)
```

Synthesis = fill all remaining holes in a way that's consistent across the three universes.

## What "consistent" means across universes

The universes impose constraints on each other:

- Widget type constrains intent: a `button` can fulfill `do(a)` but not `see(v)`. A `display` can fulfill `see(v)` but not `do(a)`. A `checkbox` can fulfill `both(see(v), do(a))`.
- Intent constrains data: `do(addTodo)` implies an endpoint/state-transition that adds a todo. The *name* "addTodo" constrains the schema.
- Data constrains widget: if the action takes a `string` argument, there must be a `give(string)` somewhere — which means a text input, which means a `bind`.
- Association constrains layout: `associate(X, Y)` means X and Y must be visually grouped in a way that communicates their semantic relationship.

## How Traces Constrain the Search Space

A trace like:

```
addTodo("Buy milk");
todos == [Todo(:active, "Buy milk")];
```

is a set of observations that eliminate completions:

- `addTodo("Buy milk")` → there exists an action `addTodo`, it takes a string, so there's a `bind(give(string), do(addTodo))` somewhere
- `todos == [...]` → there's an observable `todos`, so there's a `see(todos)` somewhere
- The causal relationship (addTodo causes todos to change) → the action's endpoint modifies the state backing the observable

Each trace line is a constraint. The full trace suite eliminates most of the search space. Synthesis fills whatever holes remain.

## The Assembly Language vs. The Intent Algebra

These are dual:

The **intent algebra** (`see`, `do`, `give`, `name`, `bind`, `both`, `each`, `pick`, `when`, `group`) describes the *finished product* — what the user can do with the UI, fully specified.

The **assembly language** (`newComponent`, `button`, `textInput`, `label`, `associate`, `action`) describes the *construction process* — how you incrementally refine from underspecified to specified, with holes along the way.

They should be interconvertible. A fully-assembled widget tree (no holes) is equivalent to a composed intent tree. A partially-assembled widget tree (some holes) is equivalent to a *partially specified* intent tree — a search space.

## Open Questions

- Is `associate` the right primitive for relating components, or should there be more specific relations? (e.g., "X submits Y's value" vs "X and Y are in the same visual group" vs "X controls Y's visibility")
- How do the three universes interact with the `each` operator? When you have a list, you're saying "repeat this partially-specified thing for each item" — the holes in the template get filled per-item.
- The `pick` operator creates mutual exclusion. Is that a widget-universe thing (only one tab is active) or an intent-universe thing (the user's intent is to choose one option)?
- How does the assembly sequence interact with undo/branching? If you're exploring a search space, you might want to backtrack.
