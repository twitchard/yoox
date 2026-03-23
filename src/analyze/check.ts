// Validation and consistency checking for trace files

import type { TraceFile } from "../parse/ast.js";
import type { AppModel } from "./model.js";

export interface Diagnostic {
  level: "error" | "warning";
  message: string;
  line?: number;
}

export function check(traceFile: TraceFile, model: AppModel): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Check: routes exist
  if (model.routes.length === 0) {
    diagnostics.push({
      level: "warning",
      message: "No route declarations found. Expected at least one !GET / directive.",
    });
  }

  // Check: at least one state variable or action
  if (model.stateVars.length === 0 && model.actions.length === 0) {
    diagnostics.push({
      level: "error",
      message: "No state variables or actions found in traces.",
    });
  }

  // Check: traces have at least one statement
  for (let i = 0; i < traceFile.traces.length; i++) {
    const trace = traceFile.traces[i];
    if (trace.statements.length === 0) {
      diagnostics.push({
        level: "warning",
        message: `Trace ${i + 1} has no statements.`,
      });
    }
  }

  // Check: actions referenced in traces are consistent in arity
  const actionArities = new Map<string, number[]>();
  for (const trace of traceFile.traces) {
    for (const stmt of trace.statements) {
      if (stmt.kind === "action") {
        if (!actionArities.has(stmt.name)) {
          actionArities.set(stmt.name, []);
        }
        actionArities.get(stmt.name)!.push(stmt.args.length);
      }
    }
  }
  for (const [name, arities] of actionArities) {
    const unique = [...new Set(arities)];
    if (unique.length > 1) {
      diagnostics.push({
        level: "error",
        message: `Action '${name}' is called with inconsistent arities: ${unique.join(", ")}`,
      });
    }
  }

  return diagnostics;
}
