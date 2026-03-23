// Lexer for .ux trace files

export type TokenKind =
  | "number"
  | "string"
  | "ident"
  | "symbol" // :foo
  | "indexed_ref" // 0_foo
  | "lparen"
  | "rparen"
  | "lbracket"
  | "rbracket"
  | "comma"
  | "semicolon"
  | "dot"
  | "eq_eq" // ==
  | "bang" // ! (for route directives)
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "ne" // !=
  | "plus"
  | "minus"
  | "and" // 'and' keyword
  | "or" // 'or' keyword
  | "not" // 'not' keyword
  | "route_verb" // GET, POST, etc. (after !)
  | "path" // /foo/bar
  | "eof";

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  col: number;
}

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  function advance(n = 1) {
    for (let j = 0; j < n; j++) {
      if (source[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  }

  function peek(): string {
    return source[i] ?? "";
  }

  function peekAt(offset: number): string {
    return source[i + offset] ?? "";
  }

  while (i < source.length) {
    // Skip whitespace (not newlines — they're just whitespace here too)
    if (/\s/.test(peek())) {
      advance();
      continue;
    }

    // Comments
    if (peek() === "#") {
      while (i < source.length && peek() !== "\n") advance();
      continue;
    }

    const startLine = line;
    const startCol = col;

    // Route directive: !VERB /path
    if (peek() === "!") {
      advance(); // skip !
      // Read verb
      let verb = "";
      while (i < source.length && /[A-Z]/.test(peek())) {
        verb += peek();
        advance();
      }
      tokens.push({ kind: "route_verb", value: verb, line: startLine, col: startCol });
      // Skip whitespace
      while (i < source.length && peek() === " ") advance();
      // Read path
      let path = "";
      while (i < source.length && /[^\s;#]/.test(peek())) {
        path += peek();
        advance();
      }
      tokens.push({ kind: "path", value: path, line: startLine, col: startCol + verb.length + 1 });
      continue;
    }

    // String literal
    if (peek() === '"') {
      advance(); // skip opening quote
      let str = "";
      while (i < source.length && peek() !== '"') {
        if (peek() === "\\") {
          advance();
          const esc = peek();
          if (esc === "n") str += "\n";
          else if (esc === "t") str += "\t";
          else if (esc === "\\") str += "\\";
          else if (esc === '"') str += '"';
          else str += esc;
        } else {
          str += peek();
        }
        advance();
      }
      advance(); // skip closing quote
      tokens.push({ kind: "string", value: str, line: startLine, col: startCol });
      continue;
    }

    // Symbol: :identifier
    if (peek() === ":" && /[a-zA-Z_]/.test(peekAt(1))) {
      advance(); // skip :
      let name = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(peek())) {
        name += peek();
        advance();
      }
      tokens.push({ kind: "symbol", value: name, line: startLine, col: startCol });
      continue;
    }

    // Number or indexed reference (e.g., 0_visibleTodo or 42)
    if (/[0-9]/.test(peek())) {
      let num = "";
      while (i < source.length && /[0-9]/.test(peek())) {
        num += peek();
        advance();
      }
      // Check for indexed reference: 0_name
      if (peek() === "_" && /[a-zA-Z]/.test(peekAt(1))) {
        advance(); // skip _
        let name = "";
        while (i < source.length && /[a-zA-Z0-9_]/.test(peek())) {
          name += peek();
          advance();
        }
        tokens.push({ kind: "indexed_ref", value: `${num}_${name}`, line: startLine, col: startCol });
      } else {
        tokens.push({ kind: "number", value: num, line: startLine, col: startCol });
      }
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(peek())) {
      let ident = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(peek())) {
        ident += peek();
        advance();
      }
      if (ident === "and") {
        tokens.push({ kind: "and", value: ident, line: startLine, col: startCol });
      } else if (ident === "or") {
        tokens.push({ kind: "or", value: ident, line: startLine, col: startCol });
      } else if (ident === "not") {
        tokens.push({ kind: "not", value: ident, line: startLine, col: startCol });
      } else {
        tokens.push({ kind: "ident", value: ident, line: startLine, col: startCol });
      }
      continue;
    }

    // Two-character operators
    if (peek() === "=" && peekAt(1) === "=") {
      tokens.push({ kind: "eq_eq", value: "==", line: startLine, col: startCol });
      advance(2);
      continue;
    }
    if (peek() === "!" && peekAt(1) === "=") {
      tokens.push({ kind: "ne", value: "!=", line: startLine, col: startCol });
      advance(2);
      continue;
    }
    if (peek() === ">" && peekAt(1) === "=") {
      tokens.push({ kind: "gte", value: ">=", line: startLine, col: startCol });
      advance(2);
      continue;
    }
    if (peek() === "<" && peekAt(1) === "=") {
      tokens.push({ kind: "lte", value: "<=", line: startLine, col: startCol });
      advance(2);
      continue;
    }

    // Single-character tokens
    const singles: Record<string, TokenKind> = {
      "(": "lparen",
      ")": "rparen",
      "[": "lbracket",
      "]": "rbracket",
      ",": "comma",
      ";": "semicolon",
      ".": "dot",
      ">": "gt",
      "<": "lt",
      "+": "plus",
      "-": "minus",
    };

    const ch = peek();
    if (ch in singles) {
      tokens.push({ kind: singles[ch], value: ch, line: startLine, col: startCol });
      advance();
      continue;
    }

    throw new Error(`Unexpected character '${peek()}' at line ${startLine}, col ${startCol}`);
  }

  tokens.push({ kind: "eof", value: "", line, col });
  return tokens;
}
