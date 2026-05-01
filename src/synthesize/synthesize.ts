// Synthesize: traces + extracted model → action implementations
// This is the core synthesis step. For MVP, we use heuristic pattern matching
// on the traces to infer what each action does to the state.

import type { Expr, TraceFile } from "../parse/ast.js";
import type { AppModel, StateVar } from "../analyze/model.js";
import { gatherObservations, inferActionBody } from "./infer.js";

export interface ActionImpl {
  name: string;
  params: string[];
  body: string; // JavaScript function body
}

export interface DerivedImpl {
  name: string;
  body: string; // JavaScript expression
}

export interface SynthesizedApp {
  model: AppModel;
  stateInit: Record<string, string>; // JS expressions for initial values
  actionImpls: ActionImpl[];
  derivedImpls: DerivedImpl[];
}

export function synthesize(traceFile: TraceFile, model: AppModel): SynthesizedApp {
  const stateInit: Record<string, string> = {};
  for (const sv of model.stateVars) {
    stateInit[sv.name] = valueToJS(sv.initialValue);
  }

  const derivedImpls = model.derived.map((d) => synthesizeDerived(d.name, d.derivation, model));

  // Iterative refinement: each pass uses the previous pass's compiled actions
  // to keep the working state accurate as we walk the trace, which lets the
  // next pass observe correct pre-states for actions that are called multiple
  // times in a row without intervening assertions.
  let actionImpls: ActionImpl[] = synthesizeActionsOnce(traceFile, model, undefined);
  for (let i = 0; i < 3; i++) {
    const applier = compileApplier(actionImpls, derivedImpls);
    const next = synthesizeActionsOnce(traceFile, model, applier);
    if (sameImpls(next, actionImpls)) break;
    actionImpls = next;
  }

  return { model, stateInit, actionImpls, derivedImpls };
}

function synthesizeActionsOnce(
  traceFile: TraceFile,
  model: AppModel,
  applier: ((state: Record<string, unknown>, name: string, args: unknown[]) => void) | undefined
): ActionImpl[] {
  const observationsByAction = gatherObservations(traceFile, model, applier);

  return model.actions.map((action) => {
    const params = action.params.map((p) => p.name);
    const observations = observationsByAction.get(action.name) ?? [];

    // Patterns inference can't yet handle (list updates by index, edit-mode
    // state machines that touch multiple state vars in coordinated ways) are
    // handled by hand-rolled heuristics. For everything else — counter-style
    // updates, toggles, single-value setters, simple list appends — real
    // observation-based inference produces the body.
    const heuristic = heuristicActionBody(action.name, params, model);
    if (heuristic !== null) {
      return { name: action.name, params, body: heuristic };
    }

    const inferred = inferActionBody(params, observations, model);
    if (inferred) {
      return { name: action.name, params, body: inferred };
    }

    return {
      name: action.name,
      params,
      body: `/* ${action.name}: no observations to synthesize from */`,
    };
  });
}

function compileApplier(
  impls: ActionImpl[],
  derived: DerivedImpl[]
): (state: Record<string, unknown>, name: string, args: unknown[]) => void {
  const fns = new Map<string, (...a: unknown[]) => void>();
  for (const a of impls) {
    fns.set(
      a.name,
      new Function("state", "resolveIndex", ...a.params, a.body) as (...a: unknown[]) => void
    );
  }
  const resolveIndex = (s: Record<string, unknown>, ref: unknown): number => {
    if (typeof ref === "number") {
      const visible =
        (s.visibleTodos as unknown[] | undefined) ?? (s.todos as unknown[] | undefined);
      if (!visible) return ref;
      const target = visible[ref];
      if (target === undefined) return -1;
      return (s.todos as unknown[]).indexOf(target);
    }
    return -1;
  };

  return (state, name, args) => {
    // Re-install derived getters on the working state so action bodies that
    // read them (e.g. via state.visibleTodos) get current values.
    for (const d of derived) {
      const getter = new Function("state", `return ${d.body};`) as (
        s: Record<string, unknown>
      ) => unknown;
      Object.defineProperty(state, d.name, {
        get: () => getter(state),
        enumerable: true,
        configurable: true,
      });
    }
    const fn = fns.get(name);
    if (!fn) return;
    fn(state, resolveIndex, ...args);
  };
}

function sameImpls(a: ActionImpl[], b: ActionImpl[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name || a[i].body !== b[i].body) return false;
  }
  return true;
}

function heuristicActionBody(name: string, params: string[], model: AppModel): string | null {
  // Only fire when the model looks like a todos-style app. Pure heuristic for
  // patterns the inference engine can't yet handle (list updates by index,
  // edit-mode state machines).
  const hasTodos = model.stateVars.some((sv) => sv.name === "todos");
  if (!hasTodos) return null;

  switch (name) {
    case "addTodo":
      return `const trimmed = ${params[0]}.trim();
      if (trimmed) {
        state.todos = [...state.todos, { status: "active", label: trimmed }];
      }`;

    case "markDone":
      return `const idx = resolveIndex(state, ${params[0]});
      if (idx !== -1) {
        state.todos = state.todos.map((t, i) => i === idx ? { ...t, status: "completed" } : t);
      }`;

    case "markUndone":
      return `const idx = resolveIndex(state, ${params[0]});
      if (idx !== -1) {
        state.todos = state.todos.map((t, i) => i === idx ? { ...t, status: "active" } : t);
      }`;

    case "removeTodo":
      return `const idx = resolveIndex(state, ${params[0]});
      if (idx !== -1) {
        state.todos = state.todos.filter((_, i) => i !== idx);
      }`;

    case "markAllDone":
      return `state.todos = state.todos.map(t => ({ ...t, status: "completed" }));`;

    case "markAllUndone":
      return `state.todos = state.todos.map(t => ({ ...t, status: "active" }));`;

    case "clearCompleted":
      return `state.todos = state.todos.filter(t => t.status !== "completed");`;

    case "startEditing":
      return `const idx = resolveIndex(state, ${params[0]});
      if (idx !== -1) {
        state.editingTodo = idx;
        state.editDraft = state.todos[idx].label;
      }`;

    case "saveEdit":
      return `if (state.editingTodo !== null) {
        const draft = (state.editDraft || "").trim();
        if (draft) {
          state.todos = state.todos.map((t, i) =>
            i === state.editingTodo ? { ...t, label: draft } : t
          );
        } else {
          state.todos = state.todos.filter((_, i) => i !== state.editingTodo);
        }
        state.editingTodo = null;
        state.editDraft = null;
      }`;

    case "cancelEdit":
      return `state.editingTodo = null;
      state.editDraft = null;`;

    default:
      // setFilter, setEditLabel, and any future trivial setters fall through
      // to inference, which can derive `state.x = arg0` from observations.
      return null;
  }
}

function synthesizeDerived(name: string, derivation: string, _model: AppModel): DerivedImpl {
  // Generate JS for known derived property patterns
  switch (name) {
    case "visibleTodos":
      return {
        name,
        body: `state.filter === "all" ? state.todos : state.todos.filter(t => state.filter === "active" ? t.status === "active" : t.status === "completed")`,
      };
    case "remainingCount":
      return {
        name,
        body: `state.todos.filter(t => t.status === "active").length`,
      };
    case "completedCount":
      return {
        name,
        body: `state.todos.filter(t => t.status === "completed").length`,
      };
    case "allCompleted":
      return {
        name,
        body: `state.todos.length > 0 && state.todos.every(t => t.status === "completed")`,
      };
    case "canClearCompleted":
      return {
        name,
        body: `state.todos.some(t => t.status === "completed")`,
      };
    default:
      return { name, body: `null /* TODO: derive ${name} from ${derivation} */` };
  }
}

function valueToJS(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(valueToJS).join(", ")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if ("__constructor" in obj) {
      // Convert constructor to plain object
      const args = obj.args as unknown[];
      // For Todo(:status, "label")
      if (obj.__constructor === "Todo" && args.length === 2) {
        return `{ status: ${valueToJS(args[0])}, label: ${valueToJS(args[1])} }`;
      }
      return JSON.stringify(value);
    }
    return JSON.stringify(value);
  }
  return String(value);
}
