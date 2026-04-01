"""
Yoox Trace Parser

Parses the trace DSL into structured AST nodes:
  - Assert(name, value)        e.g. count == 0;
  - Action(name, args)         e.g. increment(); addTodo("Buy milk");
  - PageLoad(path)             e.g. !GET /
"""

import re
from dataclasses import dataclass, field
from typing import Any


# --- Value types ---

@dataclass(frozen=True)
class Symbol:
    """An enum-like symbol, e.g. :active, :completed"""
    name: str
    def __repr__(self): return f":{self.name}"

@dataclass(frozen=True)
class Constructor:
    """A data constructor, e.g. Todo(:active, "Buy milk")"""
    name: str
    args: tuple
    def __repr__(self):
        args_str = ", ".join(repr(a) for a in self.args)
        return f"{self.name}({args_str})"

# --- AST nodes ---

@dataclass
class PageLoad:
    path: str

@dataclass
class Assert:
    name: str
    value: Any

@dataclass
class Action:
    name: str
    args: list


def parse_value(s: str) -> Any:
    """Parse a value expression: number, string, symbol, list, constructor."""
    s = s.strip()

    # Integer
    if re.match(r'^-?\d+$', s):
        return int(s)

    # Boolean
    if s == 'true': return True
    if s == 'false': return False
    if s == 'nil': return None

    # String
    if s.startswith('"') and s.endswith('"'):
        return s[1:-1]

    # Symbol
    if s.startswith(':'):
        return Symbol(s[1:])

    # Empty list
    if s == '[]':
        return []

    # List
    if s.startswith('[') and s.endswith(']'):
        inner = s[1:-1].strip()
        if not inner:
            return []
        elements = split_top_level(inner, ',')
        return [parse_value(e) for e in elements]

    # Constructor e.g. Todo(:active, "Buy milk")
    m = re.match(r'^(\w+)\((.+)\)$', s, re.DOTALL)
    if m:
        name = m.group(1)
        args_str = m.group(2)
        args = split_top_level(args_str, ',')
        return Constructor(name, tuple(parse_value(a) for a in args))

    # Index reference e.g. 0_visibleTodo
    m = re.match(r'^(\d+)_(\w+)$', s)
    if m:
        return ('index', int(m.group(1)), m.group(2))

    raise ValueError(f"Cannot parse value: {s!r}")


def split_top_level(s: str, delimiter: str) -> list[str]:
    """Split string by delimiter, respecting nested parens/brackets/quotes."""
    parts = []
    depth = 0
    current = []
    in_string = False

    for ch in s:
        if ch == '"':
            in_string = not in_string
            current.append(ch)
        elif in_string:
            current.append(ch)
        elif ch in '([':
            depth += 1
            current.append(ch)
        elif ch in ')]':
            depth -= 1
            current.append(ch)
        elif ch == delimiter and depth == 0:
            parts.append(''.join(current).strip())
            current = []
        else:
            current.append(ch)

    if current:
        parts.append(''.join(current).strip())

    return [p for p in parts if p]


def parse_trace(text: str) -> list:
    """Parse a full trace into a list of AST nodes."""
    lines = []
    # First, handle !GET lines (they don't end with semicolons)
    # Then collapse multi-line constructs (lists, etc.) into single lines
    preprocessed_lines = []
    for line in text.strip().split('\n'):
        stripped = line.strip()
        if not stripped or stripped.startswith('//') or stripped.startswith('#'):
            continue
        if stripped.startswith('!GET'):
            # !GET lines are self-terminating
            preprocessed_lines.append(stripped + ";")
        else:
            preprocessed_lines.append(stripped)
    collapsed = " ".join(preprocessed_lines)

    # Now split on semicolons (respecting nesting)
    statements = split_top_level(collapsed.strip(), ';')

    nodes = []
    for stmt in statements:
        stmt = stmt.strip()
        if not stmt:
            continue

        # Page load: !GET /path
        m = re.match(r'^!GET\s+(.+)$', stmt)
        if m:
            nodes.append(PageLoad(m.group(1).strip()))
            continue

        # Assertion: name == value
        m = re.match(r'^(\w+)\s*==\s*(.+)$', stmt, re.DOTALL)
        if m:
            nodes.append(Assert(m.group(1), parse_value(m.group(2))))
            continue

        # Action: name(args)
        m = re.match(r'^(\w+)\((.*)?\)$', stmt, re.DOTALL)
        if m:
            name = m.group(1)
            args_str = m.group(2).strip() if m.group(2) else ""
            if args_str:
                args = [parse_value(a) for a in split_top_level(args_str, ',')]
            else:
                args = []
            nodes.append(Action(name, args))
            continue

        raise ValueError(f"Cannot parse statement: {stmt!r}")

    return nodes


if __name__ == "__main__":
    # Quick test
    counter_trace = """
    !GET /
    count == 0;
    increment();
    count == 1;
    decrement();
    count == 0;
    """
    for node in parse_trace(counter_trace):
        print(node)

    print()

    todo_trace = """
    !GET /
    addTodo("Buy milk");
    todos == [Todo(:active, "Buy milk")];
    remainingCount == 1;
    markDone(0_visibleTodo);
    todos == [Todo(:completed, "Buy milk")];
    remainingCount == 0;
    """
    for node in parse_trace(todo_trace):
        print(node)
