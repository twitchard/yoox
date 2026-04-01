"""
Widget Assembly: AbstractApp → Widget Tree

Maps the abstract application to a tree of composable UI primitives.
This is the "structural inference rules" from the explorations:

  - observable → display
  - no-arg action → button
  - string-arg action → form (text input + submit button)
  - index-arg action → per-item control inside a list
  - enum-arg action → selector/tabs
  - complementary actions on same field → toggle/checkbox
"""

from dataclasses import dataclass, field
from typing import Any
from abstract_app import AbstractApp


# --- Widget tree nodes ---

@dataclass
class Widget:
    """Base for all widgets."""
    id: str = ""


@dataclass
class Display(Widget):
    """Shows a value. Fulfills see(v)."""
    label: str = ""
    observable: str = ""


@dataclass
class Button(Widget):
    """Triggers an action. Fulfills do(a)."""
    label: str = ""
    action: str = ""


@dataclass
class TextInput(Widget):
    """Supplies text. Fulfills give(string)."""
    label: str = ""
    placeholder: str = ""


@dataclass
class Form(Widget):
    """Binds a text input to an action. Fulfills bind(give(string), do(a))."""
    label: str = ""
    input_widget: TextInput = None
    submit_widget: Button = None
    action: str = ""


@dataclass
class Toggle(Widget):
    """Checkbox/toggle. Fulfills both(see(bool), do(toggle))."""
    label: str = ""
    observable_field: str = ""
    on_action: str = ""
    off_action: str = ""


@dataclass
class ListWidget(Widget):
    """Repeats a template per item. Fulfills each(collection, intent)."""
    label: str = ""
    collection: str = ""
    item_template: list[Widget] = field(default_factory=list)


@dataclass
class Selector(Widget):
    """Mutually exclusive options. Fulfills pick(do(a1), ..., do(an))."""
    label: str = ""
    action: str = ""
    options: list[tuple[str, Any]] = field(default_factory=list)  # (label, value)


@dataclass
class Group(Widget):
    """Container. Fulfills group(i1, ..., in)."""
    label: str = ""
    children: list[Widget] = field(default_factory=list)


def assemble_widgets(app: AbstractApp) -> Group:
    """Apply structural inference rules to produce a widget tree."""
    children = []
    id_counter = [0]

    def next_id(prefix="w"):
        id_counter[0] += 1
        return f"{prefix}_{id_counter[0]}"

    # Detect complementary action pairs (e.g., markDone/markUndone)
    complementary_pairs = _find_complementary_pairs(app)
    paired_actions = set()
    for a1, a2 in complementary_pairs:
        paired_actions.add(a1)
        paired_actions.add(a2)

    # Detect per-item actions (index-arg)
    per_item_actions = {}
    for name, action in app.actions.items():
        for arg in action.args:
            if arg.type == "index":
                per_item_actions.setdefault(arg.index_of, []).append(name)

    # 1. Forms: actions with string args
    for name, action in app.actions.items():
        if action.args and action.args[0].type == "string":
            inp = TextInput(
                id=next_id("input"),
                label=_guess_input_label(name, action),
                placeholder=_guess_input_label(name, action),
            )
            btn = Button(
                id=next_id("btn"),
                label=_action_to_label(name),
                action=name,
            )
            form = Form(
                id=next_id("form"),
                label=name,
                input_widget=inp,
                submit_widget=btn,
                action=name,
            )
            children.append(form)

    # 2. Top-level observables → displays
    for name, sf in app.state_fields.items():
        if sf.type == "list":
            continue  # lists get their own widget below
        children.append(Display(
            id=next_id("display"),
            label=name,
            observable=name,
        ))

    # 3. Derived properties → displays
    for name in app.derived:
        children.append(Display(
            id=next_id("display"),
            label=name,
            observable=name,
        ))

    # 4. Lists with per-item actions
    for name, sf in app.state_fields.items():
        if sf.type != "list":
            continue

        item_children = []

        # Per-item displays (show the entity fields)
        entity_name = None
        for ename, edef in app.entities.items():
            entity_name = ename
            for fname, ftype in edef.fields.items():
                item_children.append(Display(
                    id=next_id("item_display"),
                    label=fname,
                    observable=fname,
                ))
            break

        # Per-item actions
        # Build a set of keys that might match index_of values
        # e.g., list "todos" should match index_of "visibleTodo", "todo", "todos"
        per_item_keys = [name]  # "todos"
        if name.endswith('s'):
            per_item_keys.append(name[:-1])  # "todo"
        for dname in app.derived:
            if name.lower() in dname.lower() or dname.lower() in name.lower():
                per_item_keys.append(dname)  # "visibleTodos"
                if dname.endswith('s'):
                    per_item_keys.append(dname[:-1])  # "visibleTodo"
        # Also check all index_of values that contain our collection name
        for aname, action in app.actions.items():
            for arg in action.args:
                if arg.type == "index" and name.lower().rstrip('s') in arg.index_of.lower():
                    per_item_keys.append(arg.index_of)

        item_action_names = set()
        for key in per_item_keys:
            for aname in per_item_actions.get(key, []):
                item_action_names.add(aname)

        # Check complementary pairs among per-item actions
        for a1, a2 in complementary_pairs:
            if a1 in item_action_names and a2 in item_action_names:
                item_children.append(Toggle(
                    id=next_id("toggle"),
                    label=f"{a1}/{a2}",
                    on_action=a1,
                    off_action=a2,
                ))
                item_action_names.discard(a1)
                item_action_names.discard(a2)

        # Remaining per-item actions → buttons
        for aname in sorted(item_action_names):
            if aname in paired_actions:
                continue
            action = app.actions[aname]
            if any(a.type == "string" for a in action.args):
                continue  # handled as form
            item_children.append(Button(
                id=next_id("item_btn"),
                label=_action_to_label(aname),
                action=aname,
            ))

        children.append(ListWidget(
            id=next_id("list"),
            label=name,
            collection=name,
            item_template=item_children,
        ))

    # 5. Selectors: enum-arg actions
    for name, action in app.actions.items():
        if action.args and action.args[0].type == "enum":
            options = [(v, v) for v in action.args[0].enum_values]
            children.append(Selector(
                id=next_id("selector"),
                label=_action_to_label(name),
                action=name,
                options=options,
            ))

    # 6. Top-level no-arg actions → buttons (excluding paired)
    for name, action in app.actions.items():
        if not action.args and name not in paired_actions:
            children.append(Button(
                id=next_id("btn"),
                label=_action_to_label(name),
                action=name,
            ))

    # 7. Top-level complementary pairs → toggles
    for a1, a2 in complementary_pairs:
        if a1 not in per_item_actions and a2 not in per_item_actions:
            is_per_item = False
            for key_actions in per_item_actions.values():
                if a1 in key_actions or a2 in key_actions:
                    is_per_item = True
                    break
            if not is_per_item:
                children.append(Toggle(
                    id=next_id("toggle"),
                    label=f"{a1}/{a2}",
                    on_action=a1,
                    off_action=a2,
                ))

    return Group(id="root", label="app", children=children)


def _find_complementary_pairs(app: AbstractApp) -> list[tuple[str, str]]:
    """Find pairs of actions that are likely complementary (e.g., markDone/markUndone)."""
    pairs = []
    names = list(app.actions.keys())
    for i, n1 in enumerate(names):
        for n2 in names[i+1:]:
            # Heuristic: same prefix, one has "Un" or "un" or opposite keyword
            if _are_complementary_names(n1, n2):
                pairs.append((n1, n2))
    return pairs


def _are_complementary_names(a, b) -> bool:
    """Heuristic: detect complementary action pairs."""
    # markDone / markUndone
    if a.lower().replace("un", "") == b.lower().replace("un", ""):
        return True
    if b.lower().replace("un", "") == a.lower().replace("un", ""):
        return True
    # markAllDone / markAllUndone
    if "all" in a.lower() and "all" in b.lower():
        base_a = a.lower().replace("all", "").replace("un", "")
        base_b = b.lower().replace("all", "").replace("un", "")
        if base_a == base_b:
            return True
    return False


def _action_to_label(name: str) -> str:
    """Convert camelCase action name to human-readable label."""
    import re
    # Insert spaces before capitals
    label = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
    return label.lower()


def _guess_input_label(action_name: str, action_def) -> str:
    """Guess what the text input should be labeled."""
    name = action_name.lower()
    if "todo" in name:
        return "task"
    if "add" in name:
        return "new item"
    return action_def.args[0].name if action_def.args else "input"


def print_widget_tree(widget: Widget, indent: int = 0):
    """Pretty-print a widget tree."""
    prefix = "  " * indent
    if isinstance(widget, Group):
        print(f"{prefix}Group({widget.label})")
        for child in widget.children:
            print_widget_tree(child, indent + 1)
    elif isinstance(widget, Form):
        print(f"{prefix}Form({widget.label})")
        print_widget_tree(widget.input_widget, indent + 1)
        print_widget_tree(widget.submit_widget, indent + 1)
    elif isinstance(widget, ListWidget):
        print(f"{prefix}List({widget.collection})")
        for child in widget.item_template:
            print_widget_tree(child, indent + 1)
    elif isinstance(widget, Display):
        print(f"{prefix}Display({widget.label}: ${widget.observable})")
    elif isinstance(widget, Button):
        print(f"{prefix}Button(\"{widget.label}\" → {widget.action})")
    elif isinstance(widget, TextInput):
        print(f"{prefix}TextInput(\"{widget.label}\")")
    elif isinstance(widget, Toggle):
        print(f"{prefix}Toggle({widget.on_action} / {widget.off_action})")
    elif isinstance(widget, Selector):
        opts = ", ".join(label for label, _ in widget.options)
        print(f"{prefix}Selector({widget.action}: [{opts}])")
    else:
        print(f"{prefix}{widget}")
