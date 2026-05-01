import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../parse/parser.js";
import { extract } from "../analyze/extract.js";
import { synthesize } from "./synthesize.js";
import { simulate } from "../verify/simulate.js";

function buildAndSimulate(source: string) {
  const traceFile = parse(source);
  const model = extract(traceFile);
  const app = synthesize(traceFile, model);
  return { app, model, result: simulate(traceFile, app) };
}

test("counter: synthesizes increment/decrement from observations", () => {
  const { app, result } = buildAndSimulate(`
    !GET /;
    count == 0;
    increment();
    count == 1;
    increment();
    count == 2;
    decrement();
    count == 1;
  `);
  assert.equal(result.failures.length, 0, JSON.stringify(result.failures));
  const inc = app.actionImpls.find((a) => a.name === "increment");
  const dec = app.actionImpls.find((a) => a.name === "decrement");
  assert.match(inc!.body, /state\.count\+\+/);
  assert.match(dec!.body, /state\.count--/);
});

test("toggle: boolean toggle inferred from flips", () => {
  const { app, result } = buildAndSimulate(`
    !GET /;
    on == false;
    toggle();
    on == true;
    toggle();
    on == false;
  `);
  assert.equal(result.failures.length, 0);
  const t = app.actionImpls.find((a) => a.name === "toggle")!;
  assert.match(t.body, /state\.on = !state\.on/);
});

test("setter: arg-copy rule inferred", () => {
  const { app, result } = buildAndSimulate(`
    !GET /;
    name == "";
    setName("alice");
    name == "alice";
    setName("bob");
    name == "bob";
  `);
  assert.equal(result.failures.length, 0);
  const s = app.actionImpls.find((a) => a.name === "setName")!;
  // The synthesizer uses the inferred param name, which for a string arg is
  // "label" (a generic placeholder). What matters is that name is set from
  // that arg, not a constant.
  assert.equal(s.params.length, 1);
  assert.match(s.body, new RegExp(`state\\.name = ${s.params[0]};`));
});

test("delta: += N for non-unit deltas", () => {
  const { app, result } = buildAndSimulate(`
    !GET /;
    score == 0;
    addPoints();
    score == 5;
    addPoints();
    score == 10;
  `);
  assert.equal(result.failures.length, 0);
  const a = app.actionImpls.find((a) => a.name === "addPoints")!;
  assert.match(a.body, /state\.score \+= 5/);
});

test("constant: reset inferred when delta isn't consistent", () => {
  const { app, result } = buildAndSimulate(`
    !GET /;
    score == 0;
    addPoints();
    score == 5;
    addPoints();
    score == 10;
    reset();
    score == 0;
    addPoints();
    score == 5;
    reset();
    score == 0;
  `);
  assert.equal(result.failures.length, 0);
  const r = app.actionImpls.find((a) => a.name === "reset")!;
  assert.match(r.body, /state\.score = 0/);
});

test("multi-var action: sets multiple state vars in one body", () => {
  const { app, result } = buildAndSimulate(`
    !GET /;
    x == 0;
    y == 0;
    z == false;
    setAll(7);
    x == 7;
    y == 7;
    z == true;
  `);
  assert.equal(result.failures.length, 0);
  const fn = app.actionImpls.find((a) => a.name === "setAll")!;
  assert.match(fn.body, /state\.x/);
  assert.match(fn.body, /state\.y/);
  assert.match(fn.body, /state\.z/);
});
