import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../parse/parser.js";
import { extract } from "./extract.js";

test("extracts initial state vars from leading assertions", () => {
  const tf = parse(`
    !GET /;
    count == 0;
    name == "";
  `);
  const model = extract(tf);
  const names = model.stateVars.map((s) => s.name).sort();
  assert.deepEqual(names, ["count", "name"]);
  const count = model.stateVars.find((s) => s.name === "count")!;
  assert.equal(count.type.kind, "number");
  assert.equal(count.initialValue, 0);
});

test("merges symbol values across action calls", () => {
  const tf = parse(`
    !GET /;
    theme == :light;
    setTheme(:dark);
    theme == :dark;
    setTheme(:light);
    theme == :light;
  `);
  const model = extract(tf);
  const setTheme = model.actions.find((a) => a.name === "setTheme")!;
  assert.equal(setTheme.params.length, 1);
  assert.equal(setTheme.params[0].type.kind, "symbol");
  if (setTheme.params[0].type.kind === "symbol") {
    assert.deepEqual(setTheme.params[0].type.values.sort(), ["dark", "light"]);
  }
});

test("identifies todo derived properties", () => {
  const tf = parse(`
    !GET /;
    todos == [];
    visibleTodos == [];
    remainingCount == 0;
    completedCount == 0;
  `);
  const model = extract(tf);
  const derivedNames = model.derived.map((d) => d.name).sort();
  assert.ok(derivedNames.includes("visibleTodos"));
  assert.ok(derivedNames.includes("remainingCount"));
  assert.ok(derivedNames.includes("completedCount"));
  assert.equal(model.stateVars.some((s) => s.name === "visibleTodos"), false);
});
