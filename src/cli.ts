#!/usr/bin/env node

// Yoox CLI — main entry point

import * as fs from "node:fs";
import * as path from "node:path";
import { parse } from "./parse/parser.js";
import { extract } from "./analyze/extract.js";
import { check } from "./analyze/check.js";
import { synthesize } from "./synthesize/synthesize.js";
import { generateHTML } from "./generate/html.js";
import { startDevServer } from "./dev/server.js";
import { simulate } from "./verify/simulate.js";
import type { AppModel } from "./analyze/model.js";
import type { YooxType } from "./analyze/model.js";

function readInput(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  const stat = fs.statSync(resolved);

  if (stat.isDirectory()) {
    const files = fs.readdirSync(resolved).filter((f) => f.endsWith(".ux"));
    if (files.length === 0) {
      console.error(`Error: No .ux files found in ${resolved}`);
      process.exit(1);
    }
    return files.map((f) => fs.readFileSync(path.join(resolved, f), "utf-8")).join("\n---\n");
  }

  return fs.readFileSync(resolved, "utf-8");
}

function buildHTML(inputPath: string): string {
  const source = readInput(inputPath);
  const traceFile = parse(source);
  const model = extract(traceFile);
  const app = synthesize(traceFile, model);
  return generateHTML(app);
}

function cmdBuild(inputPath: string, outputDir: string, format: string): void {
  console.log(`Building ${inputPath}...`);

  const source = readInput(inputPath);
  const traceFile = parse(source);
  const model = extract(traceFile);

  // Run checks
  const diagnostics = check(traceFile, model);
  for (const d of diagnostics) {
    const prefix = d.level === "error" ? "ERROR" : "WARN";
    console.log(`  [${prefix}] ${d.message}`);
  }
  if (diagnostics.some((d) => d.level === "error")) {
    console.error("\nBuild failed due to errors.");
    process.exit(1);
  }

  const app = synthesize(traceFile, model);

  if (format === "html") {
    const html = generateHTML(app);
    const outDir = path.resolve(outputDir);
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, "index.html");
    fs.writeFileSync(outFile, html, "utf-8");
    console.log(`\n  Output: ${outFile}`);
  } else {
    console.error(`Unknown format: ${format}. Supported: html`);
    process.exit(1);
  }
}

function cmdCheck(inputPath: string): void {
  console.log(`Checking ${inputPath}...`);

  const source = readInput(inputPath);
  const traceFile = parse(source);
  const model = extract(traceFile);
  const diagnostics = check(traceFile, model);

  if (diagnostics.length === 0) {
    console.log("  No issues found.");
    return;
  }

  for (const d of diagnostics) {
    const prefix = d.level === "error" ? "ERROR" : "WARN";
    console.log(`  [${prefix}] ${d.message}`);
  }

  if (diagnostics.some((d) => d.level === "error")) {
    process.exit(1);
  }
}

function cmdInspect(inputPath: string): void {
  const source = readInput(inputPath);
  const traceFile = parse(source);
  const model = extract(traceFile);

  console.log("State:");
  for (const sv of model.stateVars) {
    console.log(`  ${sv.name}: ${formatType(sv.type)}  (initial: ${JSON.stringify(sv.initialValue)})`);
  }

  if (model.derived.length > 0) {
    console.log("\nDerived:");
    for (const d of model.derived) {
      console.log(`  ${d.name}: ${formatType(d.type)}  = ${d.derivation}`);
    }
  }

  console.log("\nActions:");
  for (const a of model.actions) {
    const params = a.params.map((p) => `${p.name}: ${formatType(p.type)}`).join(", ");
    console.log(`  ${a.name}(${params})`);
  }

  if (model.routes.length > 0) {
    console.log("\nRoutes:");
    for (const r of model.routes) {
      console.log(`  ${r.method} ${r.path}`);
    }
  }
}

function cmdDev(inputPath: string, port: number): void {
  startDevServer(inputPath, buildHTML, port);
}

function cmdVerify(inputPath: string): void {
  const source = readInput(inputPath);
  const traceFile = parse(source);
  const model = extract(traceFile);
  const app = synthesize(traceFile, model);

  const result = simulate(traceFile, app);

  console.log(`Verifying ${inputPath}...`);
  console.log(
    `  ${result.passedAssertions}/${result.totalAssertions} assertions passed` +
      (result.failures.length === 0 ? "" : `, ${result.failures.length} failure(s)`)
  );

  for (const f of result.failures) {
    console.log(`  [FAIL] trace ${f.traceIndex} step ${f.stepIndex}: ${f.message}`);
  }

  if (result.failures.length > 0) {
    process.exit(1);
  }
}

function formatType(t: YooxType): string {
  switch (t.kind) {
    case "string":
      return "String";
    case "number":
      return "Int";
    case "bool":
      return "Bool";
    case "nil":
      return "nil";
    case "symbol":
      return t.values.map((v) => `:${v}`).join(" | ");
    case "list":
      return `List<${formatType(t.element)}>`;
    case "record":
      return `${t.name}(${t.fields.map(formatType).join(", ")})`;
    case "union":
      return t.types.map(formatType).join(" | ");
    case "unknown":
      return "?";
  }
}

function printUsage(): void {
  console.log(`
yoox — program synthesis of web apps from UX traces

Usage:
  yoox build <input> [options]    Build a web app from trace files
  yoox check <input>              Validate trace files
  yoox verify <input>             Simulate traces against the synthesized app
  yoox inspect <input>            Show inferred app model
  yoox dev <input> [options]      Build + serve with live reload

Options:
  -o, --output <dir>     Output directory (default: ./dist)
  --format <fmt>         Output format: html (default: html)
  --port <port>          Dev server port (default: 3000)
  -h, --help             Show this help

Examples:
  yoox build counter.ux
  yoox build ./traces/ -o ./dist
  yoox dev todo.ux --port 8080
  yoox inspect todo.ux
`);
}

// --- Argument parsing ---

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const rest = args.slice(1);

  // Parse flags
  let input = "";
  let output = "./dist";
  let format = "html";
  let port = 3000;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "-o" || arg === "--output") {
      output = rest[++i] ?? output;
    } else if (arg === "--format") {
      format = rest[++i] ?? format;
    } else if (arg === "--port") {
      port = parseInt(rest[++i] ?? "3000");
    } else if (!arg.startsWith("-")) {
      input = arg;
    }
  }

  if (!input && command !== "help") {
    console.error("Error: No input file specified.");
    printUsage();
    process.exit(1);
  }

  switch (command) {
    case "build":
      cmdBuild(input, output, format);
      break;
    case "check":
      cmdCheck(input);
      break;
    case "verify":
      cmdVerify(input);
      break;
    case "inspect":
      cmdInspect(input);
      break;
    case "dev":
      cmdDev(input, port);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
