# Yoox

Yoox is a tool for program synthesis of web apps.

## The Idea

There are two defining ideas:

**1. Model the user.**

A web app, ultimately, is a set of UI elements that the user can interact with to achieve a goal. The traditional way to build a web app is to describe the **UI elements** explicitly and leave the **user goals** implicit. Yoox reverses this. With Yoox, you model UX, not UI. User goals are more explicit. UI elements are not described directly but produced in a separate step that translates the UX model into a functional UI. The hope is *correctness by construction* — correctness in the case of a web app means "does the app actually enable the user to achieve their goals."

**2. UX traces.**

The way you describe UX is by providing a set of "UX traces". A UX trace is a description of a sequence of interactions a user might have with the app. The trace doesn't reference UI elements like buttons or tables or text boxes — it is more abstract. The user takes actions, the user supplies and observes information. UX traces look a lot like automated tests — calling functions ↔ taking actions, observing information ↔ making assertions. Yoox combines the set of UX traces and synthesizes a logical specification of the entire app. This logical specification is then what is translated into a functional UI.

## Examples

### Increment/decrement counter

```
!GET /
count == 0;
increment();
count == 1;
decrement();
count == 0;
```

From this trace, Yoox synthesizes something like:

```js
count = 0
function increment() { count++ }
function decrement() { count-- }
function view() {
  document.innerHTML = `
    <div>count: ${count}</div>
    <button onclick="do(() => increment())">increment</button>
    <button onclick="do(() => decrement())">decrement</button>
  `
}
function do(action) { action(); view() }
```

### TODO app

```
todos == [];
addTodo("Hello");
todos == [Todo(:not_done, "Hello")]
markDone(0_todo)
todos[0].0 == :done
markUndone(0_todo)
todos[0].0 == :not_done
removeTodo(0_todo)
todos == []
```

See [examples.md](./examples.md) for a full trace suite covering filtering, editing, bulk operations, and edge cases.

## Motivation

### Problem 1: We describe machines, not experiences.

We don't actually describe what we intend our users to experience. Instead, we describe a *machine* that (hopefully) *happens to create* the experience for our users. Writing a web app involves things like "reducers", "context managers", "routers" — concepts quite foreign to how your users (and likely your product managers) understand your app.

### Problem 2: We overcommit to details before we care about them.

When building the earliest prototype of a new feature, what matters is what data is presented to the user and what data the user can send back. The selection of specific UI elements, their arrangement on the page, the division onto different pages, the names of REST endpoints and query params — all of that comes later. Yet there is really no way to build an MVP web app without specifying these details along the way.

We can't say "the user can write a biography for their profile." We have to say "there is a label with the text 'bio' next to a `<textarea>` inside a `<form>` with a submit button and an `onsubmit` action to `POST /profile`." We don't describe the experience; we describe in significant detail the parts and assembly of a machine capable of producing it.

### Problem 3: Function is intermingled with presentation.

In web 1.0, much hype surrounded the separation of HTML, Javascript, and CSS — exemplified by CSS Zen Garden, which let you swap stylesheets to dramatically change a page's appearance. But this was somewhat of an empty promise: stylesheets depended on specific divs in the specific HTML.

Late into the age of web frameworks, the common practice has swung to *not* separating these concerns. Tailwind puts stylings right in the HTML. JSX and CSS-in-JS weave styles intricately through Javascript. This intermingling is a sensible reaction to the failure of vanilla separation — but it surrenders the dream of describing *what an app does* separately from *rules for presenting it*.

Yoox is an attempt to reclaim that dream.

## Try it

```
npm install
npm run build

# Build a self-contained HTML app from a trace
node dist/cli.js build examples/theme.ux -o ./dist-app
open ./dist-app/index.html

# Or run with live reload
node dist/cli.js dev examples/todo.ux --port 3000

# Inspect what was inferred from the trace
node dist/cli.js inspect examples/todo.ux

# Simulate the synthesized app against the trace and report any
# assertion that fails — this is what verifies that synthesis
# preserved the UX described by the trace.
node dist/cli.js verify examples/theme.ux
```

`examples/theme.ux` is the cleanest example of synthesis-by-observation: every
action body — increments, decrements, boolean toggles, symbol setters,
constant resets — is derived from before/after state pairs in the trace, not
from pattern-matching action names. Run `inspect` and `build` against it and
look at the generated `index.html` to see what falls out.

## Status

Experimental / research project. Not ready for production use.

The synthesis pipeline currently handles:
- numeric updates (constants, deltas, `++`/`--`),
- boolean toggles,
- single-arg setters (`state.x = arg`),
- list-append with structured elements derived from args,
- todo-style list updates by index (via heuristic fallback for now).

`yoox verify` runs the trace against the synthesized app to catch synthesis
regressions; `npm test` runs the same checks plus parser/extractor unit tests.
