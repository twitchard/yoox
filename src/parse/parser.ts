// Parser for .ux trace files

import { lex, type Token, type TokenKind } from "./lexer.js";
import type { Expr, Statement, Trace, TraceFile } from "./ast.js";

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    this.pos++;
    return tok;
  }

  private expect(kind: TokenKind): Token {
    const tok = this.peek();
    if (tok.kind !== kind) {
      throw new Error(
        `Expected ${kind} but got ${tok.kind} ("${tok.value}") at line ${tok.line}, col ${tok.col}`
      );
    }
    return this.advance();
  }

  private match(kind: TokenKind): Token | null {
    if (this.peek().kind === kind) return this.advance();
    return null;
  }

  parseTraceFile(): TraceFile {
    const statements: Statement[] = [];

    while (this.peek().kind !== "eof") {
      statements.push(this.parseStatement());
    }

    // Group into a single trace for now (multi-trace files could be split by --- later)
    return { traces: [{ statements }] };
  }

  private parseStatement(): Statement {
    // Route directive: route_verb followed by path
    if (this.peek().kind === "route_verb") {
      const verb = this.advance();
      const path = this.expect("path");
      this.match("semicolon");
      return { kind: "route", method: verb.value, path: path.value };
    }

    // Could be an assertion (expr == expr;) or action (name(args);)
    // We need lookahead: ident followed by ( is an action, otherwise it starts an assertion expr
    if (
      this.peek().kind === "ident" &&
      this.pos + 1 < this.tokens.length &&
      this.tokens[this.pos + 1].kind === "lparen"
    ) {
      // Check if this is a constructor by seeing if first letter is uppercase
      const name = this.peek().value;
      if (name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) {
        // Uppercase — this is a constructor expression, parse as assertion
        return this.parseAssertion();
      }
      // Action call
      return this.parseAction();
    }

    return this.parseAssertion();
  }

  private parseAction(): Statement {
    const name = this.expect("ident");
    this.expect("lparen");
    const args: Expr[] = [];
    if (this.peek().kind !== "rparen") {
      args.push(this.parseExpr());
      while (this.match("comma")) {
        args.push(this.parseExpr());
      }
    }
    this.expect("rparen");
    this.expect("semicolon");
    return { kind: "action", name: name.value, args };
  }

  private parseAssertion(): Statement {
    // Parse left side as a postfix expr (no comparison — we need to stop before ==)
    const left = this.parsePostfix();
    this.expect("eq_eq");
    const right = this.parseExpr();
    this.expect("semicolon");
    return { kind: "assertion", left, right };
  }

  parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.match("or")) {
      const right = this.parseAnd();
      left = { kind: "binop", op: "or", left, right };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseComparison();
    while (this.match("and")) {
      const right = this.parseComparison();
      left = { kind: "binop", op: "and", left, right };
    }
    return left;
  }

  private parseComparison(): Expr {
    let left = this.parseAddSub();
    const ops: TokenKind[] = ["eq_eq", "ne", "gt", "lt", "gte", "lte"];
    while (ops.includes(this.peek().kind)) {
      const op = this.advance();
      const right = this.parseAddSub();
      left = { kind: "binop", op: op.value, left, right };
    }
    return left;
  }

  private parseAddSub(): Expr {
    let left = this.parseUnary();
    while (this.peek().kind === "plus" || this.peek().kind === "minus") {
      const op = this.advance();
      const right = this.parseUnary();
      left = { kind: "binop", op: op.value, left, right };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.match("not")) {
      const operand = this.parseUnary();
      return { kind: "unaryop", op: "not", operand };
    }
    if (this.peek().kind === "minus") {
      this.advance();
      const operand = this.parseUnary();
      return { kind: "unaryop", op: "-", operand };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match("dot")) {
        // Member access: .name or .0
        if (this.peek().kind === "number") {
          const num = this.advance();
          expr = { kind: "member", object: expr, property: parseInt(num.value) };
        } else {
          const name = this.expect("ident");
          expr = { kind: "member", object: expr, property: name.value };
        }
      } else if (this.peek().kind === "lbracket") {
        this.advance();
        const index = this.parseExpr();
        this.expect("rbracket");
        if (index.kind === "number") {
          expr = { kind: "member", object: expr, property: index.value };
        } else {
          // For dynamic indexing, treat as member with expression (simplification)
          expr = { kind: "member", object: expr, property: 0 }; // TODO: handle dynamic
        }
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimary(): Expr {
    const tok = this.peek();

    // Number
    if (tok.kind === "number") {
      this.advance();
      return { kind: "number", value: parseFloat(tok.value) };
    }

    // String
    if (tok.kind === "string") {
      this.advance();
      return { kind: "string", value: tok.value };
    }

    // Symbol (:name)
    if (tok.kind === "symbol") {
      this.advance();
      return { kind: "symbol", name: tok.value };
    }

    // Indexed reference (0_name)
    if (tok.kind === "indexed_ref") {
      this.advance();
      const parts = tok.value.split("_");
      const idx = parseInt(parts[0]);
      const name = parts.slice(1).join("_");
      return { kind: "indexed_ref", index: idx, name };
    }

    // nil, true, false
    if (tok.kind === "ident" && tok.value === "nil") {
      this.advance();
      return { kind: "nil" };
    }
    if (tok.kind === "ident" && tok.value === "true") {
      this.advance();
      return { kind: "bool", value: true };
    }
    if (tok.kind === "ident" && tok.value === "false") {
      this.advance();
      return { kind: "bool", value: false };
    }

    // Identifier — could be function call, constructor, or plain ident
    if (tok.kind === "ident") {
      this.advance();
      if (this.peek().kind === "lparen") {
        this.advance(); // skip (
        const args: Expr[] = [];
        if (this.peek().kind !== "rparen") {
          args.push(this.parseExpr());
          while (this.match("comma")) {
            args.push(this.parseExpr());
          }
        }
        this.expect("rparen");
        // Uppercase first letter = constructor
        if (tok.value[0] === tok.value[0].toUpperCase() && tok.value[0] !== tok.value[0].toLowerCase()) {
          return { kind: "constructor", name: tok.value, args };
        }
        return { kind: "call", name: tok.value, args };
      }
      return { kind: "ident", name: tok.value };
    }

    // List literal [...]
    if (tok.kind === "lbracket") {
      this.advance();
      const elements: Expr[] = [];
      if (this.peek().kind !== "rbracket") {
        elements.push(this.parseExpr());
        while (this.match("comma")) {
          // Allow trailing comma
          if (this.peek().kind === "rbracket") break;
          elements.push(this.parseExpr());
        }
      }
      this.expect("rbracket");
      return { kind: "list", elements };
    }

    // Parenthesized expression
    if (tok.kind === "lparen") {
      this.advance();
      const expr = this.parseExpr();
      this.expect("rparen");
      return expr;
    }

    throw new Error(
      `Unexpected token ${tok.kind} ("${tok.value}") at line ${tok.line}, col ${tok.col}`
    );
  }
}

export function parse(source: string): TraceFile {
  const tokens = lex(source);
  const parser = new Parser(tokens);
  return parser.parseTraceFile();
}

export function parseMultiTrace(source: string): TraceFile {
  // Split on "---" separator lines for multi-trace files
  const sections = source.split(/\n---+\n/);
  const traces: Trace[] = [];
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    const tf = parse(trimmed);
    traces.push(...tf.traces);
  }
  return { traces };
}
