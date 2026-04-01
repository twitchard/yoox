#!/usr/bin/env python3
"""
Yoox End-to-End Pipeline

Traces → Parse → Infer Abstract App → Validate → Assemble Widgets → Generate HTML

Usage:
  python3 pipeline.py counter    # Run counter app pipeline
  python3 pipeline.py todo       # Run todo app pipeline
"""

import sys
import os

from trace_parser import parse_trace
from inference import infer_app
from widget_assembly import assemble_widgets, print_widget_tree
from codegen import generate_html


# ============================================================
# Counter traces
# ============================================================

COUNTER_TRACES = [
    """
    !GET /
    count == 0;
    increment();
    count == 1;
    decrement();
    count == 0;
    """,
]


# ============================================================
# Todo traces (subset — enough to exercise forms, lists, toggles, selectors)
# ============================================================

TODO_TRACES = [
    # Trace 1: empty app
    """
    !GET /
    todos == [];
    filter == :all;
    remainingCount == 0;
    completedCount == 0;
    """,

    # Trace 2: add one todo
    """
    !GET /
    addTodo("Buy milk");
    todos == [Todo(:active, "Buy milk")];
    remainingCount == 1;
    completedCount == 0;
    """,

    # Trace 5: complete and reopen
    """
    !GET /
    addTodo("Buy milk");
    markDone(0_visibleTodo);
    todos == [Todo(:completed, "Buy milk")];
    remainingCount == 0;
    completedCount == 1;
    markUndone(0_visibleTodo);
    todos == [Todo(:active, "Buy milk")];
    remainingCount == 1;
    completedCount == 0;
    """,

    # Trace 7: remove
    """
    !GET /
    addTodo("A");
    addTodo("B");
    removeTodo(0_visibleTodo);
    todos == [Todo(:active, "B")];
    remainingCount == 1;
    """,

    # Trace 9: filtering
    """
    !GET /
    addTodo("A");
    addTodo("B");
    markDone(1_visibleTodo);
    setFilter(:active);
    filter == :active;
    setFilter(:completed);
    filter == :completed;
    setFilter(:all);
    filter == :all;
    remainingCount == 1;
    completedCount == 1;
    """,
]


def run_pipeline(name: str, traces: list[str]):
    print(f"{'=' * 60}")
    print(f"  YOOX PIPELINE: {name}")
    print(f"{'=' * 60}")

    # Phase 1: Parse
    print("\n--- Phase 1: Parse Traces ---")
    parsed = [parse_trace(t) for t in traces]
    total_nodes = sum(len(p) for p in parsed)
    print(f"  Parsed {len(traces)} traces, {total_nodes} total nodes")

    # Phase 2-3: Infer Abstract App
    print("\n--- Phase 2-3: Infer Abstract Application ---")
    app = infer_app(traces)

    print(f"  State fields: {list(app.state_fields.keys())}")
    print(f"  Initial state: {app.initial_state}")
    print(f"  Actions: {list(app.actions.keys())}")
    print(f"  Derived: {list(app.derived.keys())}")
    print(f"  Entities: {list(app.entities.keys())}")

    # Phase 3.5: Validate
    print("\n--- Phase 3.5: Validate Against Traces ---")
    all_pass = True
    for i, (trace_text, trace_nodes) in enumerate(zip(traces, parsed)):
        ok, msg = app.validate_trace(trace_nodes)
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_pass = False
        print(f"  Trace {i+1}: [{status}] {msg}")

    if not all_pass:
        print("\n  *** VALIDATION FAILED — abstract app does not satisfy all traces ***")
        print("  (This is expected for complex traces that exercise features not yet synthesized)")

    # Phase 4: Widget Assembly
    print("\n--- Phase 4: Assemble Widget Tree ---")
    widget_tree = assemble_widgets(app)
    print_widget_tree(widget_tree)

    # Phase 5: Code Generation
    print("\n--- Phase 5: Generate HTML ---")
    html = generate_html(app, widget_tree)
    output_path = os.path.join(os.path.dirname(__file__), f"{name}_app.html")
    with open(output_path, 'w') as f:
        f.write(html)
    print(f"  Written to: {output_path}")
    print(f"  Size: {len(html)} bytes")

    return all_pass


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "counter"

    if target == "counter":
        run_pipeline("counter", COUNTER_TRACES)
    elif target == "todo":
        run_pipeline("todo", TODO_TRACES)
    elif target == "all":
        run_pipeline("counter", COUNTER_TRACES)
        print("\n\n")
        run_pipeline("todo", TODO_TRACES)
    else:
        print(f"Unknown target: {target}. Use 'counter', 'todo', or 'all'.")
