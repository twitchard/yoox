"""
Code Generator: Widget Tree + AbstractApp → HTML/JS

Generates a self-contained HTML file with vanilla JS that implements
the application. This is phase 5: the rendered product.
"""

from widget_assembly import (
    Widget, Group, Form, ListWidget, Display, Button,
    TextInput, Toggle, Selector,
)
from abstract_app import AbstractApp


def generate_html(app: AbstractApp, widget_tree: Group) -> str:
    """Generate a complete HTML file from an abstract app + widget tree."""
    state_js = _gen_state_init(app)
    actions_js = _gen_actions(app)
    derived_js = _gen_derived(app)
    render_js = _gen_render(widget_tree, app)

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Yoox Generated App</title>
<style>
  body {{ font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; }}
  .form-group {{ display: flex; gap: 8px; margin: 12px 0; }}
  .form-group input {{ flex: 1; padding: 8px; font-size: 16px; }}
  button {{ padding: 8px 16px; cursor: pointer; font-size: 14px; }}
  .list-item {{ display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #eee; }}
  .display {{ margin: 8px 0; color: #555; }}
  .selector {{ display: flex; gap: 4px; margin: 12px 0; }}
  .selector button {{ background: #eee; border: 1px solid #ccc; }}
  .selector button.active {{ background: #4CAF50; color: white; border-color: #4CAF50; }}
  .toggle {{ cursor: pointer; }}
</style>
</head>
<body>
<div id="app"></div>
<script>
// === State ===
{state_js}

// === Derived ===
function getDerived() {{
{derived_js}
}}

// === Actions ===
{actions_js}

// === Observe (state + derived) ===
function observe() {{
  return {{ ...state, ...getDerived() }};
}}

// === Render ===
function render() {{
  const obs = observe();
  const app = document.getElementById('app');
  app.innerHTML = '';
{render_js}
}}

// === Do (action + re-render) ===
function doAction(fn) {{
  fn();
  render();
}}

// Initial render
render();
</script>
</body>
</html>"""


def _gen_state_init(app: AbstractApp) -> str:
    """Generate state initialization JS."""
    fields = []
    for name, value in app.initial_state.items():
        fields.append(f"  {name}: {_to_js_value(value)}")
    return "const state = {\n" + ",\n".join(fields) + "\n};"


def _gen_actions(app: AbstractApp) -> str:
    """Generate action functions in JS."""
    lines = []
    for name, action in app.actions.items():
        arg_names = [a.name for a in action.args]
        args_str = ", ".join(arg_names)

        # We need to express the effect in JS
        effect_js = _synthesize_js_effect(name, action, app)
        lines.append(f"function action_{name}({args_str}) {{\n{effect_js}\n}}")

    return "\n\n".join(lines)


def _synthesize_js_effect(name: str, action, app: AbstractApp) -> str:
    """Generate JS code for an action's effect.

    This re-derives the effect from what we know about the action,
    using the same patterns as the inference engine.
    """
    args = action.args

    # No args: check if it's a scalar mutation
    if not args:
        # Look at state fields to guess what it modifies
        for sf_name, sf in app.state_fields.items():
            if sf.type == "int":
                if "increment" in name.lower() or "incr" in name.lower():
                    return f"  state.{sf_name}++;"
                if "decrement" in name.lower() or "decr" in name.lower():
                    return f"  state.{sf_name}--;"
        return "  // no-op"

    # String arg: list append
    if args[0].type == "string":
        list_fields = [n for n, sf in app.state_fields.items() if sf.type == "list"]
        if list_fields:
            lf = list_fields[0]
            # Get entity info
            entity = None
            for e in app.entities.values():
                entity = e
                break
            if entity:
                fnames = list(entity.fields.keys())
                return (
                    f"  const text = {args[0].name}.trim();\n"
                    f"  if (!text) return;\n"
                    f"  state.{lf}.push({{ type: '{entity.name}', {fnames[0]}: 'active', {fnames[1]}: text }});"
                )

    # Index arg: field mutation
    if args[0].type == "index":
        list_fields = [n for n, sf in app.state_fields.items() if sf.type == "list"]
        if list_fields:
            lf = list_fields[0]
            entity = None
            for e in app.entities.values():
                entity = e
                break
            if entity:
                fnames = list(entity.fields.keys())
                status_field = fnames[0] if fnames else "status"
                # Guess the target value from the action name
                if "done" in name.lower() and "un" not in name.lower():
                    return f"  state.{lf}[{args[0].name}].{status_field} = 'completed';"
                elif "undone" in name.lower() or ("un" in name.lower() and "done" in name.lower()):
                    return f"  state.{lf}[{args[0].name}].{status_field} = 'active';"
                elif "remove" in name.lower() or "delete" in name.lower():
                    return f"  state.{lf}.splice({args[0].name}, 1);"

    # Enum arg: direct assignment
    if args[0].type == "enum":
        # Find which state field this sets
        for sf_name, sf in app.state_fields.items():
            if sf.type == "enum":
                return f"  state.{sf_name} = {args[0].name};"

    return "  // TODO: effect not synthesized"


def _gen_derived(app: AbstractApp) -> str:
    """Generate derived property computations in JS."""
    if not app.derived:
        return "  return {};"

    lines = ["  const d = {};"]
    for name, derived in app.derived.items():
        # Generate JS based on the derivation pattern
        if "remaining" in name.lower():
            list_fields = [n for n, sf in app.state_fields.items() if sf.type == "list"]
            if list_fields:
                lf = list_fields[0]
                entity = list(app.entities.values())[0] if app.entities else None
                sf = list(entity.fields.keys())[0] if entity else "status"
                lines.append(f"  d.{name} = state.{lf}.filter(t => t.{sf} === 'active').length;")
        elif "completed" in name.lower() and "count" in name.lower():
            list_fields = [n for n, sf in app.state_fields.items() if sf.type == "list"]
            if list_fields:
                lf = list_fields[0]
                entity = list(app.entities.values())[0] if app.entities else None
                sf = list(entity.fields.keys())[0] if entity else "status"
                lines.append(f"  d.{name} = state.{lf}.filter(t => t.{sf} === 'completed').length;")
        elif "visible" in name.lower():
            list_fields = [n for n, sf in app.state_fields.items() if sf.type == "list"]
            if list_fields:
                lf = list_fields[0]
                entity = list(app.entities.values())[0] if app.entities else None
                sf = list(entity.fields.keys())[0] if entity else "status"
                lines.append(f"  d.{name} = state.filter === 'all' ? state.{lf} : state.{lf}.filter(t => t.{sf} === state.filter);")

    lines.append("  return d;")
    return "\n".join(lines)


def _gen_render(widget_tree: Group, app: AbstractApp) -> str:
    """Generate the render function body."""
    lines = []
    _gen_widget_render(widget_tree, lines, "app", app, indent=2)
    return "\n".join(lines)


def _gen_widget_render(widget, lines, parent_var, app, indent=2):
    """Recursively generate render code for a widget."""
    pad = " " * indent
    var = f"el_{widget.id}" if hasattr(widget, 'id') and widget.id else "el"

    if isinstance(widget, Group):
        for child in widget.children:
            _gen_widget_render(child, lines, parent_var, app, indent)

    elif isinstance(widget, Display):
        lines.append(f"{pad}{{")
        lines.append(f"{pad}  const {var} = document.createElement('div');")
        lines.append(f"{pad}  {var}.className = 'display';")
        lines.append(f"{pad}  {var}.textContent = '{_display_label(widget.label)}: ' + JSON.stringify(obs.{widget.observable});")
        lines.append(f"{pad}  {parent_var}.appendChild({var});")
        lines.append(f"{pad}}}")

    elif isinstance(widget, Button):
        lines.append(f"{pad}{{")
        lines.append(f"{pad}  const {var} = document.createElement('button');")
        lines.append(f"{pad}  {var}.textContent = '{widget.label}';")
        lines.append(f"{pad}  {var}.onclick = () => doAction(() => action_{widget.action}());")
        lines.append(f"{pad}  {parent_var}.appendChild({var});")
        lines.append(f"{pad}}}")

    elif isinstance(widget, Form):
        input_id = f"input_{widget.id}"
        lines.append(f"{pad}{{")
        lines.append(f"{pad}  const {var} = document.createElement('div');")
        lines.append(f"{pad}  {var}.className = 'form-group';")
        lines.append(f"{pad}  const inp = document.createElement('input');")
        lines.append(f"{pad}  inp.type = 'text';")
        lines.append(f"{pad}  inp.id = '{input_id}';")
        lines.append(f"{pad}  inp.placeholder = '{widget.input_widget.placeholder}';")
        lines.append(f"{pad}  const btn = document.createElement('button');")
        lines.append(f"{pad}  btn.textContent = '{widget.submit_widget.label}';")
        lines.append(f"{pad}  const submit = () => {{ doAction(() => action_{widget.action}(inp.value)); inp.value = ''; }};")
        lines.append(f"{pad}  btn.onclick = submit;")
        lines.append(f"{pad}  inp.onkeydown = (e) => {{ if (e.key === 'Enter') submit(); }};")
        lines.append(f"{pad}  {var}.appendChild(inp);")
        lines.append(f"{pad}  {var}.appendChild(btn);")
        lines.append(f"{pad}  {parent_var}.appendChild({var});")
        lines.append(f"{pad}}}")

    elif isinstance(widget, ListWidget):
        entity = list(app.entities.values())[0] if app.entities else None
        fnames = list(entity.fields.keys()) if entity else []
        status_field = fnames[0] if fnames else "status"
        label_field = fnames[1] if len(fnames) > 1 else "label"

        lines.append(f"{pad}{{")
        lines.append(f"{pad}  const list = obs.{widget.collection} || [];")
        lines.append(f"{pad}  list.forEach((item, idx) => {{")
        lines.append(f"{pad}    const row = document.createElement('div');")
        lines.append(f"{pad}    row.className = 'list-item';")

        # Render item template
        for child in widget.item_template:
            if isinstance(child, Toggle):
                lines.append(f"{pad}    const cb = document.createElement('input');")
                lines.append(f"{pad}    cb.type = 'checkbox';")
                lines.append(f"{pad}    cb.className = 'toggle';")
                lines.append(f"{pad}    cb.checked = item.{status_field} === 'completed';")
                lines.append(f"{pad}    cb.onchange = () => doAction(() => {{")
                lines.append(f"{pad}      if (cb.checked) action_{child.on_action}(idx);")
                lines.append(f"{pad}      else action_{child.off_action}(idx);")
                lines.append(f"{pad}    }});")
                lines.append(f"{pad}    row.appendChild(cb);")
            elif isinstance(child, Display):
                lines.append(f"{pad}    const lbl = document.createElement('span');")
                lines.append(f"{pad}    lbl.textContent = item.{label_field};")
                lines.append(f"{pad}    if (item.{status_field} === 'completed') lbl.style.textDecoration = 'line-through';")
                lines.append(f"{pad}    row.appendChild(lbl);")
            elif isinstance(child, Button):
                lines.append(f"{pad}    const btn = document.createElement('button');")
                lines.append(f"{pad}    btn.textContent = '{child.label}';")
                lines.append(f"{pad}    btn.onclick = () => doAction(() => action_{child.action}(idx));")
                lines.append(f"{pad}    row.appendChild(btn);")

        lines.append(f"{pad}    {parent_var}.appendChild(row);")
        lines.append(f"{pad}  }});")
        lines.append(f"{pad}}}")

    elif isinstance(widget, Selector):
        lines.append(f"{pad}{{")
        lines.append(f"{pad}  const {var} = document.createElement('div');")
        lines.append(f"{pad}  {var}.className = 'selector';")
        for label, value in widget.options:
            lines.append(f"{pad}  {{")
            lines.append(f"{pad}    const btn = document.createElement('button');")
            lines.append(f"{pad}    btn.textContent = '{label}';")
            # Find which state field this selector controls
            enum_fields = [n for n, sf in app.state_fields.items() if sf.type == "enum"]
            if enum_fields:
                ef = enum_fields[0]
                lines.append(f"{pad}    if (obs.{ef} === '{value}') btn.className = 'active';")
            lines.append(f"{pad}    btn.onclick = () => doAction(() => action_{widget.action}('{value}'));")
            lines.append(f"{pad}    {var}.appendChild(btn);")
            lines.append(f"{pad}  }}")
        lines.append(f"{pad}  {parent_var}.appendChild({var});")
        lines.append(f"{pad}}}")

    elif isinstance(widget, Toggle):
        # Top-level toggle (not in a list)
        lines.append(f"{pad}{{")
        lines.append(f"{pad}  const {var} = document.createElement('label');")
        lines.append(f"{pad}  const cb = document.createElement('input');")
        lines.append(f"{pad}  cb.type = 'checkbox';")
        lines.append(f"{pad}  cb.onchange = () => doAction(() => {{")
        lines.append(f"{pad}    if (cb.checked) action_{widget.on_action}();")
        lines.append(f"{pad}    else action_{widget.off_action}();")
        lines.append(f"{pad}  }});")
        lines.append(f"{pad}  {var}.appendChild(cb);")
        lines.append(f"{pad}  {var}.appendChild(document.createTextNode('{widget.label}'));")
        lines.append(f"{pad}  {parent_var}.appendChild({var});")
        lines.append(f"{pad}}}")


def _display_label(name: str) -> str:
    """Make a label human-readable."""
    import re
    label = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
    return label


def _to_js_value(value) -> str:
    """Convert a Python value to JS literal."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        return f"'{value}'"
    if isinstance(value, list):
        elements = [_to_js_value(v) for v in value]
        return "[" + ", ".join(elements) + "]"
    if isinstance(value, dict):
        fields = [f"{k}: {_to_js_value(v)}" for k, v in value.items()]
        return "{ " + ", ".join(fields) + " }"
    return repr(value)
