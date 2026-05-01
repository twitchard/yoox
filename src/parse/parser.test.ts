import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "./parser.js";

test("parses route directive", () => {
  const tf = parse("!GET /;\ncount == 0;\n");
  assert.equal(tf.traces.length, 1);
  const stmts = tf.traces[0].statements;
  assert.equal(stmts[0].kind, "route");
  if (stmts[0].kind === "route") {
    assert.equal(stmts[0].method, "GET");
    assert.equal(stmts[0].path, "/");
  }
});

test("parses assertion with literal", () => {
  const tf = parse("count == 0;\n");
  const s = tf.traces[0].statements[0];
  assert.equal(s.kind, "assertion");
  if (s.kind === "assertion") {
    assert.equal(s.left.kind, "ident");
    assert.equal(s.right.kind, "number");
  }
});

test("parses action call with string and symbol args", () => {
  const tf = parse('addTodo("hi");\nsetFilter(:active);\n');
  const a = tf.traces[0].statements[0];
  const b = tf.traces[0].statements[1];
  assert.equal(a.kind, "action");
  if (a.kind === "action") {
    assert.equal(a.name, "addTodo");
    assert.equal(a.args[0].kind, "string");
  }
  assert.equal(b.kind, "action");
  if (b.kind === "action") {
    assert.equal(b.args[0].kind, "symbol");
    if (b.args[0].kind === "symbol") assert.equal(b.args[0].name, "active");
  }
});

test("parses indexed_ref arg", () => {
  const tf = parse("markDone(0_visibleTodo);\n");
  const s = tf.traces[0].statements[0];
  assert.equal(s.kind, "action");
  if (s.kind === "action") {
    const arg = s.args[0];
    assert.equal(arg.kind, "indexed_ref");
    if (arg.kind === "indexed_ref") {
      assert.equal(arg.index, 0);
      assert.equal(arg.name, "visibleTodo");
    }
  }
});

test("parses constructor in list", () => {
  const tf = parse('todos == [Todo(:active, "Buy milk")];\n');
  const s = tf.traces[0].statements[0];
  assert.equal(s.kind, "assertion");
  if (s.kind === "assertion" && s.right.kind === "list") {
    assert.equal(s.right.elements.length, 1);
    assert.equal(s.right.elements[0].kind, "constructor");
  }
});

test("parses comments and blank lines", () => {
  const src = `
# this is a comment
count == 0;

# another
increment();
`;
  const tf = parse(src);
  assert.equal(tf.traces[0].statements.length, 2);
});
