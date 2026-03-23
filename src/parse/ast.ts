// AST types for .ux trace files

export type Expr =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "nil" }
  | { kind: "symbol"; name: string }
  | { kind: "ident"; name: string }
  | { kind: "indexed_ref"; index: number; name: string } // e.g. 0_visibleTodo
  | { kind: "list"; elements: Expr[] }
  | { kind: "constructor"; name: string; args: Expr[] } // e.g. Todo(:active, "Buy milk")
  | { kind: "member"; object: Expr; property: string | number } // e.g. todos[0].0
  | { kind: "call"; name: string; args: Expr[] } // function call as expression
  | { kind: "binop"; op: string; left: Expr; right: Expr }
  | { kind: "unaryop"; op: string; operand: Expr };

export type Statement =
  | { kind: "route"; method: string; path: string }
  | { kind: "assertion"; left: Expr; right: Expr } // left == right
  | { kind: "action"; name: string; args: Expr[] }; // action invocation

export interface Trace {
  name?: string;
  statements: Statement[];
}

export interface TraceFile {
  traces: Trace[];
}
