// Trace simulator: runs a TraceFile against a SynthesizedApp, verifying that
// every assertion holds when actions are applied in sequence. Functions as
// both a runtime validator (yoox verify) and the regression harness for
// synthesis quality.

import type { Expr, Statement, TraceFile } from "../parse/ast.js";
import type { SynthesizedApp } from "../synthesize/synthesize.js";

export interface SimFailure {
  traceIndex: number;
  stepIndex: number;
  statement: Statement;
  message: string;
}

export interface SimResult {
  totalAssertions: number;
  passedAssertions: number;
  failures: SimFailure[];
}

interface SimContext {
  state: Record<string, unknown>;
  invoke(name: string, args: unknown[]): void;
}

export function simulate(traceFile: TraceFile, app: SynthesizedApp): SimResult {
  const result: SimResult = { totalAssertions: 0, passedAssertions: 0, failures: [] };

  for (let traceIdx = 0; traceIdx < traceFile.traces.length; traceIdx++) {
    const trace = traceFile.traces[traceIdx];
    const ctx = makeContext(app);

    let step = 0;
    for (const stmt of trace.statements) {
      if (stmt.kind === "route") continue;
      step++;

      if (stmt.kind === "assertion") {
        result.totalAssertions++;
        let actual: unknown;
        let expected: unknown;
        try {
          actual = evalExpr(stmt.left, ctx);
          expected = evalExpr(stmt.right, ctx);
        } catch (e) {
          result.failures.push({
            traceIndex: traceIdx,
            stepIndex: step,
            statement: stmt,
            message: `Eval error: ${(e as Error).message}`,
          });
          continue;
        }
        if (deepEqual(actual, expected)) {
          result.passedAssertions++;
        } else {
          result.failures.push({
            traceIndex: traceIdx,
            stepIndex: step,
            statement: stmt,
            message: `${exprToString(stmt.left)} expected ${formatValue(expected)}, got ${formatValue(actual)}`,
          });
        }
      } else if (stmt.kind === "action") {
        let args: unknown[];
        try {
          args = stmt.args.map((a) => evalExpr(a, ctx));
        } catch (e) {
          result.failures.push({
            traceIndex: traceIdx,
            stepIndex: step,
            statement: stmt,
            message: `Arg eval error: ${(e as Error).message}`,
          });
          continue;
        }
        try {
          ctx.invoke(stmt.name, args);
        } catch (e) {
          result.failures.push({
            traceIndex: traceIdx,
            stepIndex: step,
            statement: stmt,
            message: `Action ${stmt.name}(${args.map(formatValue).join(", ")}) threw: ${(e as Error).message}`,
          });
        }
      }
    }
  }

  return result;
}

function makeContext(app: SynthesizedApp): SimContext {
  const state: Record<string, unknown> = {};
  // Initialize state from synthesized initial values (eval the JS expression).
  for (const sv of app.model.stateVars) {
    const initJS = app.stateInit[sv.name];
    state[sv.name] = evalJS(`return ${initJS};`);
  }

  // Install derived getters.
  for (const d of app.derivedImpls) {
    const getter = new Function("state", `return ${d.body};`) as (s: typeof state) => unknown;
    Object.defineProperty(state, d.name, {
      get: () => getter(state),
      enumerable: true,
      configurable: true,
    });
  }

  // resolveIndex helper used by some synthesized actions.
  const resolveIndex = (s: typeof state, ref: unknown): number => {
    if (typeof ref === "number") {
      const visible = (s.visibleTodos as unknown[] | undefined) ?? (s.todos as unknown[] | undefined);
      if (!visible) return ref;
      const target = visible[ref];
      if (target === undefined) return -1;
      return (s.todos as unknown[]).indexOf(target);
    }
    return typeof ref === "number" ? ref : -1;
  };

  // Compile each action body into a Function.
  const fns = new Map<string, (...args: unknown[]) => void>();
  for (const a of app.actionImpls) {
    const fn = new Function("state", "resolveIndex", ...a.params, a.body) as (
      ...args: unknown[]
    ) => void;
    fns.set(a.name, fn);
  }

  return {
    state,
    invoke(name, args) {
      const fn = fns.get(name);
      if (!fn) throw new Error(`No implementation for action ${name}`);
      fn(state, resolveIndex, ...args);
    },
  };
}

function evalJS(body: string): unknown {
  return new Function(body)();
}

// --- AST evaluator ---

function evalExpr(expr: Expr, ctx: SimContext): unknown {
  switch (expr.kind) {
    case "number":
      return expr.value;
    case "string":
      return expr.value;
    case "bool":
      return expr.value;
    case "nil":
      return null;
    case "symbol":
      return expr.name;
    case "list":
      return expr.elements.map((e) => evalExpr(e, ctx));
    case "constructor":
      return constructorToValue(expr.name, expr.args.map((a) => evalExpr(a, ctx)));
    case "ident":
      return ctx.state[expr.name];
    case "indexed_ref":
      return expr.index;
    case "member": {
      const obj = evalExpr(expr.object, ctx);
      if (obj == null) return undefined;
      return (obj as Record<string | number, unknown>)[expr.property];
    }
    case "binop": {
      const l = evalExpr(expr.left, ctx);
      const r = evalExpr(expr.right, ctx);
      switch (expr.op) {
        case "==":
          return deepEqual(l, r);
        case "!=":
          return !deepEqual(l, r);
        case ">":
          return (l as number) > (r as number);
        case "<":
          return (l as number) < (r as number);
        case ">=":
          return (l as number) >= (r as number);
        case "<=":
          return (l as number) <= (r as number);
        case "and":
          return Boolean(l) && Boolean(r);
        case "or":
          return Boolean(l) || Boolean(r);
        case "+":
          return (l as number) + (r as number);
        case "-":
          return (l as number) - (r as number);
        default:
          throw new Error(`Unknown binop: ${expr.op}`);
      }
    }
    case "unaryop": {
      const v = evalExpr(expr.operand, ctx);
      if (expr.op === "not") return !v;
      if (expr.op === "-") return -(v as number);
      throw new Error(`Unknown unaryop: ${expr.op}`);
    }
    case "call":
      throw new Error(`Bare function calls not supported in assertions: ${expr.name}`);
  }
}

function constructorToValue(name: string, args: unknown[]): unknown {
  // Match the convention used in synthesize.ts:valueToJS — Todo(:status, label)
  // becomes { status, label }. Other constructors fall back to a structured
  // object so deepEqual still works.
  if (name === "Todo" && args.length === 2) {
    return { status: args[0], label: args[1] };
  }
  return { __constructor: name, args };
}

// --- Equality and formatting ---

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(ao[k], bo[k]));
  }
  return false;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "nil";
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(formatValue).join(", ")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("__constructor" in o) {
      return `${o.__constructor as string}(${(o.args as unknown[]).map(formatValue).join(", ")})`;
    }
    return `{${Object.entries(o)
      .map(([k, x]) => `${k}: ${formatValue(x)}`)
      .join(", ")}}`;
  }
  return String(v);
}

function exprToString(expr: Expr): string {
  switch (expr.kind) {
    case "ident":
      return expr.name;
    case "member":
      return `${exprToString(expr.object)}.${expr.property}`;
    case "indexed_ref":
      return `${expr.index}_${expr.name}`;
    default:
      return formatValue(evalExprBest(expr));
  }
}

function evalExprBest(expr: Expr): unknown {
  // Best-effort literal extraction for error messages.
  switch (expr.kind) {
    case "number":
      return expr.value;
    case "string":
      return expr.value;
    case "bool":
      return expr.value;
    case "nil":
      return null;
    case "symbol":
      return expr.name;
    default:
      return "<expr>";
  }
}
