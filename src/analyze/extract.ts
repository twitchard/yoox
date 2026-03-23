// Extract state vars, actions, types, and derived properties from parsed traces

import type { Expr, Statement, TraceFile } from "../parse/ast.js";
import type { Action, ActionParam, AppModel, DerivedProperty, Route, StateVar, YooxType } from "./model.js";

export function extract(traceFile: TraceFile): AppModel {
  const stateVars = new Map<string, StateVar>();
  const actions = new Map<string, Action>();
  const derived = new Map<string, DerivedProperty>();
  const routes: Route[] = [];
  const constructors = new Map<string, number>();
  const assertedNames = new Set<string>();
  const actionNames = new Set<string>();

  // First pass: collect all action names and routes
  for (const trace of traceFile.traces) {
    for (const stmt of trace.statements) {
      if (stmt.kind === "route") {
        if (!routes.some((r) => r.method === stmt.method && r.path === stmt.path)) {
          routes.push({ method: stmt.method, path: stmt.path });
        }
      }
      if (stmt.kind === "action") {
        actionNames.add(stmt.name);
      }
    }
  }

  // Second pass: analyze assertions and actions
  for (const trace of traceFile.traces) {
    let stateAfterActions = 0; // count of actions seen so far

    for (const stmt of trace.statements) {
      if (stmt.kind === "action") {
        stateAfterActions++;

        // Register action with params
        if (!actions.has(stmt.name)) {
          const params: ActionParam[] = stmt.args.map((arg, i) => ({
            name: paramNameFromArg(arg, i),
            type: inferType(arg),
          }));
          actions.set(stmt.name, { name: stmt.name, params });
        }

        // Collect constructors from args
        collectConstructors(stmt.args, constructors);
      }

      if (stmt.kind === "assertion") {
        // Extract the variable name from the left side
        const varName = extractVarName(stmt.left);
        if (varName) {
          assertedNames.add(varName);
          const type = inferType(stmt.right);

          // Collect constructors from assertion values
          collectConstructors([stmt.right], constructors);

          if (stateAfterActions === 0) {
            // This is an initial value assertion
            if (!stateVars.has(varName)) {
              stateVars.set(varName, {
                name: varName,
                type,
                initialValue: exprToValue(stmt.right),
              });
            }
          } else {
            // Post-action assertion — update type info if needed
            if (stateVars.has(varName)) {
              const sv = stateVars.get(varName)!;
              sv.type = mergeTypes(sv.type, type);
            } else if (!stateVars.has(varName)) {
              // Variable first seen after actions — still register it
              stateVars.set(varName, {
                name: varName,
                type,
                initialValue: guessInitialValue(type),
              });
            }
          }
        }
      }
    }
  }

  // Identify derived properties: variables that are asserted but look like
  // they can be computed from other state
  const knownDerived = identifyDerived(stateVars, assertedNames, actionNames);
  for (const [name, dp] of knownDerived) {
    derived.set(name, dp);
  }

  return {
    stateVars: Array.from(stateVars.values()),
    actions: Array.from(actions.values()),
    derived: Array.from(derived.values()),
    routes,
    constructors,
  };
}

function extractVarName(expr: Expr): string | null {
  if (expr.kind === "ident") return expr.name;
  if (expr.kind === "member" && expr.object.kind === "ident") {
    // e.g., todos[0].0 — the root variable is "todos"
    return null; // member access assertions aren't top-level state vars
  }
  return null;
}

function paramNameFromArg(arg: Expr, index: number): string {
  if (arg.kind === "string") return "label";
  if (arg.kind === "indexed_ref") return arg.name;
  if (arg.kind === "number") return "index";
  if (arg.kind === "symbol") return "value";
  if (arg.kind === "ident") return arg.name;
  return `arg${index}`;
}

export function inferType(expr: Expr): YooxType {
  switch (expr.kind) {
    case "string":
      return { kind: "string" };
    case "number":
      return { kind: "number" };
    case "bool":
      return { kind: "bool" };
    case "nil":
      return { kind: "nil" };
    case "symbol":
      return { kind: "symbol", values: [expr.name] };
    case "list": {
      if (expr.elements.length === 0) return { kind: "list", element: { kind: "unknown" } };
      const elemType = inferType(expr.elements[0]);
      for (let i = 1; i < expr.elements.length; i++) {
        mergeTypes(elemType, inferType(expr.elements[i]));
      }
      return { kind: "list", element: elemType };
    }
    case "constructor":
      return {
        kind: "record",
        name: expr.name,
        fields: expr.args.map((a) => inferType(a)),
      };
    case "ident":
      return { kind: "unknown" };
    case "indexed_ref":
      return { kind: "unknown" };
    case "binop":
      if (["==", "!=", ">", "<", ">=", "<=", "and", "or"].includes(expr.op)) {
        return { kind: "bool" };
      }
      return inferType(expr.left);
    case "unaryop":
      if (expr.op === "not") return { kind: "bool" };
      return inferType(expr.operand);
    case "member":
      return { kind: "unknown" };
    case "call":
      return { kind: "unknown" };
  }
}

function mergeTypes(a: YooxType, b: YooxType): YooxType {
  if (a.kind === "unknown") return b;
  if (b.kind === "unknown") return a;
  if (a.kind === "nil" && b.kind !== "nil") return { kind: "union", types: [b, a] };
  if (b.kind === "nil" && a.kind !== "nil") return { kind: "union", types: [a, b] };
  if (a.kind === "symbol" && b.kind === "symbol") {
    const values = [...new Set([...a.values, ...b.values])];
    return { kind: "symbol", values };
  }
  if (a.kind === b.kind) return a;
  return { kind: "union", types: [a, b] };
}

function exprToValue(expr: Expr): unknown {
  switch (expr.kind) {
    case "string":
      return expr.value;
    case "number":
      return expr.value;
    case "bool":
      return expr.value;
    case "nil":
      return null;
    case "symbol":
      return expr.name;
    case "list":
      return expr.elements.map(exprToValue);
    case "constructor":
      return { __constructor: expr.name, args: expr.args.map(exprToValue) };
    default:
      return undefined;
  }
}

function guessInitialValue(type: YooxType): unknown {
  switch (type.kind) {
    case "string":
      return "";
    case "number":
      return 0;
    case "bool":
      return false;
    case "nil":
      return null;
    case "list":
      return [];
    case "symbol":
      return type.values[0];
    default:
      return null;
  }
}

function collectConstructors(exprs: Expr[], constructors: Map<string, number>): void {
  for (const expr of exprs) {
    if (expr.kind === "constructor") {
      constructors.set(expr.name, expr.args.length);
      collectConstructors(expr.args, constructors);
    }
    if (expr.kind === "list") {
      collectConstructors(expr.elements, constructors);
    }
  }
}

function identifyDerived(
  stateVars: Map<string, StateVar>,
  _assertedNames: Set<string>,
  _actionNames: Set<string>
): Map<string, DerivedProperty> {
  const derived = new Map<string, DerivedProperty>();

  // Heuristic: known patterns for derived properties
  const knownPatterns: Record<string, { derivation: string; dependsOn: string[] }> = {
    visibleTodos: { derivation: "filter(todos, filter)", dependsOn: ["todos", "filter"] },
    remainingCount: {
      derivation: 'count(todos where status == "active")',
      dependsOn: ["todos"],
    },
    completedCount: {
      derivation: 'count(todos where status == "completed")',
      dependsOn: ["todos"],
    },
    allCompleted: {
      derivation: "todos != [] and remainingCount == 0",
      dependsOn: ["todos", "remainingCount"],
    },
    canClearCompleted: { derivation: "completedCount > 0", dependsOn: ["completedCount"] },
  };

  for (const [name, pattern] of Object.entries(knownPatterns)) {
    if (stateVars.has(name)) {
      const sv = stateVars.get(name)!;
      derived.set(name, {
        name,
        type: sv.type,
        derivation: pattern.derivation,
        dependsOn: pattern.dependsOn,
      });
      stateVars.delete(name);
    }
  }

  return derived;
}
