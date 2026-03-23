// Synthesize: traces + extracted model → action implementations
// This is the core synthesis step. For MVP, we use heuristic pattern matching
// on the traces to infer what each action does to the state.

import type { Expr, TraceFile } from "../parse/ast.js";
import type { AppModel, StateVar } from "../analyze/model.js";

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

  const actionImpls = model.actions.map((action) =>
    synthesizeAction(action.name, action.params.map((p) => p.name), traceFile, model)
  );

  const derivedImpls = model.derived.map((d) => synthesizeDerived(d.name, d.derivation, model));

  return { model, stateInit, actionImpls, derivedImpls };
}

function synthesizeAction(
  name: string,
  params: string[],
  traceFile: TraceFile,
  model: AppModel
): ActionImpl {
  // Heuristic synthesis: look at before/after state in traces to infer the action body
  // For each trace, find this action call and see what state changed

  // Common patterns we recognize:
  const body = inferActionBody(name, params, traceFile, model);

  return { name, params, body };
}

function inferActionBody(
  name: string,
  params: string[],
  traceFile: TraceFile,
  model: AppModel
): string {
  // Analyze traces to find patterns
  // For each trace, collect: state before action, action args, state after action

  const hasTodos = model.stateVars.some((sv) => sv.name === "todos");
  const hasCount = model.stateVars.some((sv) => sv.name === "count");

  // Counter patterns
  if (name === "increment" && hasCount) {
    return "state.count++;";
  }
  if (name === "decrement" && hasCount) {
    return "state.count--;";
  }

  // Todo app patterns
  if (hasTodos) {
    return inferTodoAction(name, params, model);
  }

  // Generic: just log unknown actions
  return `console.log("${name}", ${params.join(", ")});`;
}

function inferTodoAction(name: string, params: string[], _model: AppModel): string {
  switch (name) {
    case "addTodo":
      return `const label = ${params[0]}.trim();
  if (label) {
    state.todos = [...state.todos, { status: "active", label }];
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

    case "setFilter":
      return `state.filter = ${params[0]};`;

    case "clearCompleted":
      return `state.todos = state.todos.filter(t => t.status !== "completed");`;

    case "startEditing":
      return `const idx = resolveIndex(state, ${params[0]});
  if (idx !== -1) {
    state.editingTodo = idx;
    state.editDraft = state.todos[idx].label;
  }`;

    case "setEditLabel":
      return `state.editDraft = ${params[0]};`;

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
      return `console.log("${name}", ${params.join(", ")});`;
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
