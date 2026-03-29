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

---

## On Validation and Multiple Approaches (from conversation, March 2026)

> I think you've chosen a particular structure that seems to match the intuitions but might not actually "work out"?
>
> I would like you to consider multiple structures and do some validation about whether they work out or not. The most complete form of validation would be a complete working implementation, but obviously that is expensive and I don't want you to do that. A more feasible form of validation would be a complete written out example. That is still quite expensive. A cheap thing would just you write out a little outline / explainer like you already have for each approach. So that is where you should start but you should branch out and try multiple things. One thing you can do to add a little bit more rigor to your research for each approach is to write out a little logic program that illustrates how a particular component of the system might work.
>
> Remember that there are several various parts of this. There is the UX specification part which I have ordained will take the form of these little assertion-like user flows. That intent-modeling is kind of related to, but possibly distinct from the data modeling part where you specify what the entities are in the system, like there is a todo object, todo object has these statuses. Or there is a post object, a profile object, the profile object has a biography.
>
> There is this step where the UX specifications are synthesized into this kind of abstract application that is built up and satisfies all the individual specifications but is free from the particulars of widgets or even interface modality -- i.e. an abstract application could equally describe a phone-based voice menu to a website to a mobile app to a smart tv app to a system of paper forms. Then there is this kind of widget assembly step, where a universe of composable primitives live alongside a universe of composable intent primitives and a concrete UI that satisfies the abstract application spec is synthesized.
>
> Another question is, how to exploit generative AI in all of this. Clearly it can help with authoring the initial specifications. Maybe in lieu of synthesizing widget-by-widget assembly and producing a complete, renderable app, instead what gets produced is an "abstract implementation", a logical (still checkable/abstractly runnable, but not browser-renderable yet) spec -- this spec is input into generative AI to serve as the *basis* for a finished runnable product (and then when the spec changes, the diff is given to generative AI to update the end product)

## Key Architectural Insight: The Pipeline

There are distinct phases, and different approaches may handle the boundaries between them differently:

1. **UX Specification** — assertion-like user flows (the traces we already have)
2. **Data Modeling** — entity definitions, schemas, relationships (possibly distinct from intent modeling)
3. **Abstract Application** — synthesized from (1) and (2), modality-independent, satisfies all specs. Could describe a phone menu, a website, a mobile app, a system of paper forms equally.
4. **Widget Assembly / Concrete UI** — a specific modality (web, mobile, voice) is chosen, abstract app is realized in composable primitives
5. **Renderable Product** — actual running code

The question of where generative AI fits: maybe the system produces a *checkable abstract spec* (phase 3 or 4), and generative AI bridges from that to phase 5. When the spec changes, the diff is what gets handed to AI for update. This means the formal/checkable part stays small and trustworthy, and the messy/implementation part is delegated.

## The "Does It Work Out?" Question

The current structure (three atomic intents + seven operators + assembly with holes) might not survive contact with real examples. Specific worries:

- Does the `associate` relation actually capture everything? Or do we need a richer relational vocabulary?
- Is the separation between intent algebra and assembly language real, or are they just two notations for the same thing?
- Does the modality-independence of the "abstract application" layer actually hold? Are there intents that only make sense in specific modalities?
- Can the assembly language actually define useful search spaces, or does the space explode combinatorially?
- Where does data modeling fit? The current framework treats it as the "data universe" but doesn't really formalize it.
