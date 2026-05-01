import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../parse/parser.js";
import { extract } from "../analyze/extract.js";
import { synthesize } from "../synthesize/synthesize.js";
import { simulate } from "./simulate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const examples = path.resolve(here, "../../examples");

function verifyFile(name: string) {
  const src = fs.readFileSync(path.join(examples, name), "utf-8");
  const traceFile = parse(src);
  const model = extract(traceFile);
  const app = synthesize(traceFile, model);
  return simulate(traceFile, app);
}

test("counter example verifies", () => {
  const r = verifyFile("counter.ux");
  assert.equal(r.failures.length, 0, JSON.stringify(r.failures));
  assert.equal(r.passedAssertions, r.totalAssertions);
});

test("todo example verifies", () => {
  const r = verifyFile("todo.ux");
  assert.equal(r.failures.length, 0, JSON.stringify(r.failures));
  assert.equal(r.passedAssertions, r.totalAssertions);
});

test("theme example verifies", () => {
  const r = verifyFile("theme.ux");
  assert.equal(r.failures.length, 0, JSON.stringify(r.failures));
  assert.equal(r.passedAssertions, r.totalAssertions);
});

test("simulator reports a failure for an inconsistent trace", () => {
  // The synthesizer can't satisfy this — once it learns `setName(arg)`,
  // the second assertion `name == "fixed"` will fail because the actual
  // state will be "bob".
  const traceFile = parse(`
    !GET /;
    name == "";
    setName("alice");
    name == "alice";
    setName("bob");
    name == "fixed";
  `);
  const model = extract(traceFile);
  const app = synthesize(traceFile, model);
  const r = simulate(traceFile, app);
  assert.ok(r.failures.length > 0, "expected at least one failure");
});
