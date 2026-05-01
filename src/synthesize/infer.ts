// Action synthesis by observation: walk the traces, collect (preState, args,
// postState) tuples for every action call, then infer the simplest update
// rule per state variable that explains every observation.
//
// This is a real (if narrow) synthesis: we don't pattern-match on action
// names. Counter / toggle / theme / single-arg setter actions all fall out
// of the same rule library.

import type { Expr, Statement, TraceFile } from "../parse/ast.js";
import type { AppModel } from "../analyze/model.js";

export interface Observation {
  preState: Record<string, unknown>;
  args: unknown[];
  postState: Record<string, unknown>;
}

export type ActionApplier = (
  state: Record<string, unknown>,
  name: string,
  args: unknown[]
) => void;

export function gatherObservations(
  traceFile: TraceFile,
  model: AppModel,
  applyAction?: ActionApplier
): Map<string, Observation[]> {
  const result = new Map<string, Observation[]>();
  for (const action of model.actions) result.set(action.name, []);

  for (const trace of traceFile.traces) {
    const state: Record<string, unknown> = {};
    // A var is "valid" in the current state when its value reflects an
    // explicit assertion (or initial declaration, or applier-computed
    // result). We drop observations whose pre-state for a var isn't
    // backed by something we can trust — otherwise multiple consecutive
    // calls to the same action without intermediate assertions feed
    // garbage pre-states into inference.
    const valid = new Map<string, boolean>();
    for (const sv of model.stateVars) {
      state[sv.name] = sv.initialValue;
      valid.set(sv.name, true);
    }

    let pending: {
      name: string;
      preState: Record<string, unknown>;
      args: unknown[];
      postState: Record<string, unknown>;
    } | null = null;

    const flush = () => {
      if (pending) {
        result.get(pending.name)?.push({
          preState: pending.preState,
          args: pending.args,
          postState: pending.postState,
        });
        pending = null;
      }
    };

    for (const stmt of trace.statements) {
      if (stmt.kind === "assertion") {
        const name = topVarName(stmt.left);
        if (name) {
          const value = exprToValue(stmt.right);
          if (pending) pending.postState[name] = value;
          const desc = Object.getOwnPropertyDescriptor(state, name);
          if (!desc || desc.writable !== false) {
            try {
              state[name] = value;
            } catch {
              // getter-only property; leave it.
            }
          }
          valid.set(name, true);
        }
      } else if (stmt.kind === "action") {
        flush();
        const args = stmt.args.map(exprToValue);
        // Snapshot only validated vars; missing vars are simply absent
        // from preState rather than carrying stale values.
        const preState: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(state)) {
          if (valid.get(k)) preState[k] = deepCopy(v);
        }
        pending = { name: stmt.name, preState, args, postState: {} };

        if (applyAction) {
          try {
            applyAction(state, stmt.name, args);
            // Trust the applier: every var it touches is now valid.
            for (const k of Object.keys(state)) valid.set(k, true);
          } catch {
            for (const k of valid.keys()) valid.set(k, false);
          }
        } else {
          // No applier — we don't know what the action did; subsequent
          // pre-snapshots are unreliable until an assertion re-validates.
          for (const k of valid.keys()) valid.set(k, false);
        }
      }
    }
    flush();
  }

  return result;
}

export function inferActionBody(
  params: string[],
  observations: Observation[],
  model: AppModel
): string | null {
  const lines: string[] = [];
  for (const sv of model.stateVars) {
    const rule = inferUpdateRule(sv.name, params, observations);
    if (rule) lines.push(rule);
  }
  if (lines.length === 0) return null;
  return lines.join("\n      ");
}

function inferUpdateRule(
  varName: string,
  params: string[],
  observations: Observation[]
): string | null {
  // Require both a known pre-state and a known post-state for the var.
  // Observations missing either side are dropped — they can't constrain
  // the rule and including them risks corrupting a clean signal.
  const obs = observations.filter(
    (o) => varName in o.postState && varName in o.preState
  );
  if (obs.length === 0) return null;

  // Rules are ordered most-specific (uses pre/args) to least-specific (raw
  // constant). With a single observation the constant rule trivially fires,
  // so we always try args- and pre-derived rules first.

  // 1. Identity — variable provably unchanged.
  if (obs.every((o) => deepEqual(o.postState[varName], o.preState[varName]))) {
    return null;
  }

  // 2. Numeric delta (covers ++ / -- / += N / -= N).
  if (
    obs.every(
      (o) =>
        typeof o.postState[varName] === "number" && typeof o.preState[varName] === "number"
    )
  ) {
    const deltas = obs.map(
      (o) => (o.postState[varName] as number) - (o.preState[varName] as number)
    );
    if (deltas.every((d) => d === deltas[0]) && deltas[0] !== 0) {
      const d = deltas[0];
      if (d === 1) return `state.${varName}++;`;
      if (d === -1) return `state.${varName}--;`;
      if (d > 0) return `state.${varName} += ${d};`;
      return `state.${varName} -= ${-d};`;
    }
  }

  // 3. Boolean toggle.
  if (
    obs.every(
      (o) =>
        typeof o.postState[varName] === "boolean" &&
        typeof o.preState[varName] === "boolean" &&
        o.postState[varName] === !o.preState[varName]
    )
  ) {
    return `state.${varName} = !state.${varName};`;
  }

  // 4. Arg copy — post.v === args[i] for some fixed i.
  for (let i = 0; i < params.length; i++) {
    if (obs.every((o) => i < o.args.length && deepEqual(o.postState[varName], o.args[i]))) {
      return `state.${varName} = ${params[i]};`;
    }
  }

  // 5. List append with structured element pattern.
  if (
    obs.every(
      (o) =>
        Array.isArray(o.preState[varName]) &&
        Array.isArray(o.postState[varName]) &&
        (o.postState[varName] as unknown[]).length ===
          (o.preState[varName] as unknown[]).length + 1 &&
        (o.preState[varName] as unknown[]).every((x, i) =>
          deepEqual(x, (o.postState[varName] as unknown[])[i])
        )
    )
  ) {
    const newElems = obs.map((o) => {
      const post = o.postState[varName] as unknown[];
      return post[post.length - 1];
    });
    const elemExpr = inferElementExpression(
      newElems,
      obs.map((o) => o.args),
      params
    );
    if (elemExpr) {
      return `state.${varName} = [...state.${varName}, ${elemExpr}];`;
    }
  }

  // 6. Constant assignment — fallback when no pre/args-derived rule fits.
  const firstPost = obs[0].postState[varName];
  if (obs.every((o) => deepEqual(o.postState[varName], firstPost))) {
    return `state.${varName} = ${valueToJS(firstPost)};`;
  }

  return null;
}

function inferElementExpression(
  elems: unknown[],
  allArgs: unknown[][],
  params: string[]
): string | null {
  if (elems.length === 0) return null;
  const first = elems[0];

  // Primitive new element (e.g., a list of strings appended to).
  if (first === null || typeof first !== "object" || Array.isArray(first)) {
    if (elems.every((e) => deepEqual(e, first))) return valueToJS(first);
    for (let i = 0; i < params.length; i++) {
      if (elems.every((e, j) => deepEqual(e, allArgs[j][i]))) return params[i];
    }
    return null;
  }

  // Object/record new element — synthesize each field independently.
  const fields = Object.keys(first as Record<string, unknown>);
  const parts: string[] = [];
  for (const field of fields) {
    const values = elems.map((e) => (e as Record<string, unknown>)[field]);
    if (values.every((v) => deepEqual(v, values[0]))) {
      parts.push(`${field}: ${valueToJS(values[0])}`);
      continue;
    }
    let matched: string | null = null;
    for (let i = 0; i < params.length; i++) {
      if (elems.every((_e, j) => deepEqual(values[j], allArgs[j][i]))) {
        matched = params[i];
        break;
      }
    }
    if (matched) {
      parts.push(`${field}: ${matched}`);
      continue;
    }
    return null;
  }
  return `{ ${parts.join(", ")} }`;
}

// --- Helpers shared with the simulator (kept duplicated to keep modules
// from depending on each other; both are small.) ---

export function topVarName(expr: Expr): string | null {
  if (expr.kind === "ident") return expr.name;
  return null;
}

export function exprToValue(expr: Expr): unknown {
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
    case "indexed_ref":
      return expr.index;
    case "list":
      return expr.elements.map(exprToValue);
    case "constructor":
      if (expr.name === "Todo" && expr.args.length === 2) {
        return {
          status: exprToValue(expr.args[0]),
          label: exprToValue(expr.args[1]),
        };
      }
      return { __constructor: expr.name, args: expr.args.map(exprToValue) };
    default:
      return undefined;
  }
}

export function valueToJS(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(valueToJS).join(", ")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("__constructor" in o) {
      return JSON.stringify(v);
    }
    return `{ ${Object.entries(o)
      .map(([k, x]) => `${k}: ${valueToJS(x)}`)
      .join(", ")} }`;
  }
  return String(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
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

function deepCopy<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(deepCopy) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    out[k] = deepCopy(x);
  }
  return out as T;
}
