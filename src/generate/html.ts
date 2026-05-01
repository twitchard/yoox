// Generate a single self-contained HTML file from a synthesized app

import type { SynthesizedApp } from "../synthesize/synthesize.js";
import type { AppModel } from "../analyze/model.js";

export function generateHTML(app: SynthesizedApp): string {
  const { model, stateInit, actionImpls, derivedImpls } = app;

  const stateInitCode = Object.entries(stateInit)
    .map(([k, v]) => `    ${k}: ${v}`)
    .join(",\n");

  const derivedGetters = derivedImpls
    .map((d) => `    Object.defineProperty(state, "${d.name}", { get() { return ${d.body}; }, enumerable: true });`)
    .join("\n");

  const needsResolveIndex = model.actions.some((a) =>
    ["markDone", "markUndone", "removeTodo", "startEditing"].includes(a.name)
  );

  const resolveIndexFn = needsResolveIndex
    ? `
    function resolveIndex(state, ref) {
      if (typeof ref === "number") {
        const visible = state.visibleTodos ?? state.todos;
        const target = visible[ref];
        if (!target) return -1;
        return state.todos.indexOf(target);
      }
      return ref;
    }`
    : "";

  const actionFunctions = actionImpls
    .map(
      (a) => `
    function ${a.name}(${a.params.join(", ")}) {
      ${a.body}
      render();
    }`
    )
    .join("\n");

  const hasTodos = model.stateVars.some((s) => s.name === "todos");
  const hasCount = model.stateVars.some((s) => s.name === "count");
  const title = hasTodos ? "Todo App" : hasCount ? "Counter" : "Yoox App";

  let renderFn: string;
  if (hasTodos) {
    renderFn = buildTodoRenderFn(model);
  } else if (hasCount) {
    renderFn = buildCounterRenderFn();
  } else {
    renderFn = buildGenericRenderFn(model);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      max-width: 600px; margin: 40px auto; padding: 0 20px; color: #333;
    }
    h1 { text-align: center; margin-bottom: 20px; color: #c9726a; font-size: 2em; }
    button { cursor: pointer; border: 1px solid #ccc; background: #fff; padding: 6px 12px; border-radius: 4px; }
    button:hover { background: #f0f0f0; }
    input[type="text"] { padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 16px; width: 100%; }
    .todo-input { display: flex; gap: 8px; margin-bottom: 16px; }
    .todo-input input { flex: 1; }
    .todo-list { list-style: none; }
    .todo-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #eee; }
    .todo-item.completed .todo-label { text-decoration: line-through; color: #999; }
    .todo-label { flex: 1; cursor: pointer; }
    .todo-edit { flex: 1; font-size: 16px; }
    .filters { display: flex; gap: 8px; margin: 12px 0; justify-content: center; }
    .filters button.active { background: #e0e0e0; font-weight: bold; }
    .footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; font-size: 14px; color: #666; }
    .counter-display { text-align: center; font-size: 3em; margin: 20px 0; }
    .counter-buttons { display: flex; gap: 12px; justify-content: center; }
    .counter-buttons button { font-size: 1.2em; padding: 8px 20px; }
    .bulk-actions { margin-bottom: 8px; }
    .state { background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; }
    .state .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #eee; }
    .state .row:last-child { border-bottom: none; }
    .state .key { color: #666; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .state .val { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .actions form { display: inline-flex; gap: 4px; align-items: center; }
    .actions input { padding: 4px 8px; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    const state = {
${stateInitCode}
    };

${derivedGetters}
${resolveIndexFn}
${actionFunctions}

    function escapeHTML(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

${renderFn}

    render();
  </script>
</body>
</html>`;
}

function buildCounterRenderFn(): string {
  return `    function render() {
      document.getElementById("app").innerHTML =
        '<h1>Counter</h1>' +
        '<div class="counter-display">' + state.count + '</div>' +
        '<div class="counter-buttons">' +
          '<button onclick="decrement()">−</button>' +
          '<button onclick="increment()">+</button>' +
        '</div>';
    }`;
}

function buildTodoRenderFn(model: AppModel): string {
  const hasFilter = model.derived.some((d) => d.name === "visibleTodos");
  const hasEditing = model.stateVars.some((s) => s.name === "editingTodo");
  const listSource = hasFilter ? "state.visibleTodos" : "state.todos";

  return `    function render() {
      var html = '<h1>Todos</h1>';

      // Input
      html += '<div class="todo-input">' +
        '<input type="text" id="newTodo" placeholder="What needs to be done?" ' +
          'onkeydown="if(event.key===\\'Enter\\'){addTodo(this.value);this.value=\\'\\'}">' +
        '<button onclick="var inp=document.getElementById(\\'newTodo\\');addTodo(inp.value);inp.value=\\'\\'">Add</button>' +
      '</div>';

      // Bulk actions
      if (state.todos.length > 0) {
        html += '<div class="bulk-actions">';
        if (state.allCompleted) {
          html += '<button onclick="markAllUndone()">Unmark all</button>';
        } else {
          html += '<button onclick="markAllDone()">Mark all done</button>';
        }
        html += '</div>';
      }

      // Todo list
      var items = ${listSource};
      html += '<ul class="todo-list">';
      for (var i = 0; i < items.length; i++) {
        var todo = items[i];
        var cls = todo.status === "completed" ? "todo-item completed" : "todo-item";
        html += '<li class="' + cls + '">';
        html += '<input type="checkbox" ' + (todo.status === "completed" ? "checked " : "") +
          'onchange="' + (todo.status === "completed" ? "markUndone(" + i + ")" : "markDone(" + i + ")") + '">';
${hasEditing ? `
        var todoRealIdx = state.todos.indexOf(todo);
        if (state.editingTodo === todoRealIdx) {
          html += '<input class="todo-edit" type="text" value="' + escapeHTML(state.editDraft || "") + '" ' +
            'oninput="setEditLabel(this.value)" ' +
            'onkeydown="if(event.key===\\'Enter\\')saveEdit();if(event.key===\\'Escape\\')cancelEdit();" ' +
            'autofocus>';
        } else {
          html += '<span class="todo-label" ondblclick="startEditing(' + i + ')">' + escapeHTML(todo.label) + '</span>';
        }` : `
        html += '<span class="todo-label">' + escapeHTML(todo.label) + '</span>';`}
        html += '<button onclick="removeTodo(' + i + ')">×</button>';
        html += '</li>';
      }
      html += '</ul>';
${hasFilter ? `
      // Filters
      html += '<div class="filters">';
      html += '<button class="' + (state.filter === "all" ? "active" : "") + '" onclick="setFilter(\\'all\\')">All</button>';
      html += '<button class="' + (state.filter === "active" ? "active" : "") + '" onclick="setFilter(\\'active\\')">Active</button>';
      html += '<button class="' + (state.filter === "completed" ? "active" : "") + '" onclick="setFilter(\\'completed\\')">Completed</button>';
      html += '</div>';

      // Footer
      html += '<div class="footer">';
      html += '<span>' + state.remainingCount + ' item' + (state.remainingCount !== 1 ? 's' : '') + ' left</span>';
      if (state.canClearCompleted) {
        html += '<button onclick="clearCompleted()">Clear completed</button>';
      }
      html += '</div>';` : ""}

      document.getElementById("app").innerHTML = html;
    }`;
}

function buildGenericRenderFn(model: AppModel): string {
  const stateRows = model.stateVars
    .map(
      (sv) =>
        `'<div class="row"><span class="key">${sv.name}</span>' + ` +
        `'<span class="val">' + escapeHTML(formatValue(state.${sv.name})) + '</span></div>'`
    )
    .join(" + ");

  const actionControls = model.actions
    .map((a) => buildActionControl(a, model))
    .join(" + ");

  return `    function formatValue(v) {
      if (v === null || v === undefined) return "nil";
      if (typeof v === "string") return v;
      return JSON.stringify(v);
    }

    function render() {
      document.getElementById("app").innerHTML =
        '<h1>App</h1>' +
        '<div class="state">' + ${stateRows || "''"} + '</div>' +
        '<div class="actions">' + ${actionControls || "''"} + '</div>';
    }`;
}

function buildActionControl(action: import("../analyze/model.js").Action, model: AppModel): string {
  const label = humanize(action.name);

  // Zero-arg action — single button.
  if (action.params.length === 0) {
    return `'<button onclick="${action.name}()">${label}</button>'`;
  }

  // Single symbol param — render one button per known symbol value.
  if (action.params.length === 1) {
    const p = action.params[0];
    if (p.type.kind === "symbol" && p.type.values.length > 0) {
      const buttons = p.type.values
        .map(
          (v) =>
            `'<button onclick="${action.name}(\\'${v}\\')">${humanize(action.name)}: ${v}</button>'`
        )
        .join(" + ");
      return buttons;
    }
    if (p.type.kind === "string") {
      return (
        `'<form onsubmit="event.preventDefault();var i=this.querySelector(\\'input\\');${action.name}(i.value);i.value=\\'\\';">'` +
        ` + '<input type="text" placeholder="${p.name}">' ` +
        `+ '<button type="submit">${label}</button></form>'`
      );
    }
    if (p.type.kind === "number") {
      return (
        `'<form onsubmit="event.preventDefault();var i=this.querySelector(\\'input\\');${action.name}(parseFloat(i.value));i.value=\\'\\';">'` +
        ` + '<input type="number" placeholder="${p.name}">' ` +
        `+ '<button type="submit">${label}</button></form>'`
      );
    }
    if (p.type.kind === "bool") {
      return `'<button onclick="${action.name}(true)">${label}: true</button>' + '<button onclick="${action.name}(false)">${label}: false</button>'`;
    }
  }

  // Fallback — disabled button noting the action exists but isn't directly
  // invocable from the auto-generated UI.
  return `'<button disabled title="${action.params.length}-arg action not yet auto-rendered">${label}</button>'`;
}

function humanize(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
