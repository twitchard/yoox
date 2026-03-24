# Yoox Research: Program Synthesis, UI Synthesis, and State Machines

## 1. Directly Related Work: Synthesizing UIs from Behavioral Traces

### ReDemon UI (Lee et al., UIST 2025)
The closest existing system to Yoox. Synthesizes React applications from user demonstrations. Users provide a static JSX mockup with event handler "holes" (marked with `$`-prefixed numbers), then demonstrate desired runtime behaviors. ReDemon identifies reactive data and synthesizes state update logic using enumerative synthesis for simple cases and LLMs for complex ones.

**Key difference from Yoox**: ReDemon starts from a visual mockup (Figma export), whereas Yoox starts from abstract textual UX traces with no UI specification at all. ReDemon fills in event handlers; Yoox synthesizes both the state machine and the UI.

- PDF: https://arxiv.org/pdf/2507.10099
- ACM DL: https://dl.acm.org/doi/10.1145/3746058.3758454

### Combining Functional and Automata Synthesis (Das, Tenenbaum, Solar-Lezama, Tavares; POPL 2023)
Synthesizes causal reactive programs from observation traces that include user interactions (keypresses, clicks). Combines functional synthesis (for computing outputs) with automata synthesis (for inferring state transitions). **Most technically relevant paper** — maps closely to Yoox's need to infer both state update functions and the state machine structure from traces.

- PDF: https://dspace.mit.edu/bitstream/handle/1721.1/147690/3571249.pdf

## 2. State Machines and UI Modeling

### Statecharts (Harel, 1987)
The foundational formalism for modeling stateful reactive systems. Extends flat state machines with hierarchy, concurrency, and history, making them suitable for complex UI behavior.

### XState
The dominant JavaScript implementation of statecharts, using the actor model for state management. States typically correspond 1:1 to "modes" of the UI. Framework-agnostic and serializable — the same state machine can drive React, Vue, or Svelte views. The synthesized app model (step 3 in Yoox's pipeline) could be represented as an XState-compatible statechart.

- GitHub: https://github.com/statelyai/xstate
- Docs: https://stately.ai/docs/xstate
- Statecharts in UIs: https://statecharts.dev/use-case-statecharts-in-user-interfaces.html

## 3. Trace-Based and Example-Based Program Synthesis

### Program Synthesis from Partial Traces — Syren (Ferreira, Nicolet, Dodds, Kroening; PLDI 2025)
First technique to synthesize programs composing side-effecting functions, pure functions, and control flow from partial traces (logs of only side-effecting calls). All traces are positive examples; no negative examples needed. Uses cost metrics to prevent over-generalization. Directly applicable since Yoox's `.ux` traces are all positive examples of desired behavior.

- PDF: https://dl.acm.org/doi/10.1145/3729316
- Margarida Ferreira's PhD Proposal: https://marghrid.github.io/docs/PhD_Proposal.pdf

### Program Synthesis from Execution Traces and Demonstrations (MIT, 2016)
Introduced using a database of execution traces for a programmer assistant. Matches demonstration traces against stored traces to infer code snippets. Evaluated on Swing/Eclipse applications.

- PDF: https://dspace.mit.edu/handle/1721.1/106098

### Interactive Program Synthesis by Augmented Examples — REGAE (Harvard/UIST 2020)
Lets users mark parts of examples to keep verbatim or generalize, auto-generates corner cases, and clusters programs by behavior. Relevant to how Yoox might let users iteratively refine traces.

- PDF: https://glassmanlab.seas.harvard.edu/papers/ips_augex_uist20.pdf

## 4. FlashFill and Microsoft PBE Lineage

### FlashFill / FlashFill++ / PROSE (Gulwani et al., Microsoft)
Most commercially successful PBE system. Key techniques relevant to Yoox:

- **Domain-Specific Languages (DSLs)**: PBE works best with a carefully designed DSL with invertible operators at the top and enumerable operators at the bottom. Yoox's `.ux` trace language is effectively a DSL for behavioral specifications.
- **Divide-and-Conquer synthesis**: Breaking synthesis into subproblems for subexpressions. Applicable to how Yoox could decompose trace analysis into per-action synthesis.
- **Ranking with cost metrics**: When multiple programs satisfy the examples, ranking by simplicity/cost prevents over-generalization — directly applicable to Yoox choosing between multiple state machines consistent with traces.

- FlashFill++ (POPL 2023): https://www.microsoft.com/en-us/research/wp-content/uploads/2022/12/flashfillpp-popl-23-camera-ready.pdf
- FlashMeta / PROSE (OOPSLA 2015): https://www.microsoft.com/en-us/research/wp-content/uploads/2016/12/oopsla15-pbe.pdf
- Programming by Examples Survey (2016): https://www.microsoft.com/en-us/research/wp-content/uploads/2016/12/pbe16.pdf

## 5. Design-to-Code (Sketch2Code and Successors)

### Sketch2Code (MIT/Microsoft, 2024 benchmark)
Evaluates Vision-Language Models on converting hand-drawn wireframes to HTML, using 731 sketches from 484 real webpages. Complementary to Yoox rather than competitive: solves "visual design to markup" while Yoox solves "behavioral specification to functional app."

- PDF: https://arxiv.org/pdf/2410.16232
- Microsoft Sketch2Code: https://github.com/microsoft/ailab/tree/master/Sketch2Code

## 6. Automata Learning / State Machine Inference from Traces

Active automata learning (L*, discrimination trees) and passive learning (state merging, red-blue framework) are established techniques for inferring state machines from observed traces.

- AALpy (Python library): https://github.com/DES-Lab/AALpy
- Active Automata Learning Survey: https://wcventure.github.io/Active-Automata-Learning/
- Q-PAI: Q-Learning for Passive Automaton Inference (2025): https://arxiv.org/pdf/2510.17386

## 7. General Program Synthesis Background

### Key Approaches
- **Enumerative synthesis**: Exhaustively searches the program space, pruning with observational equivalence. Oracle-Guided Inductive Synthesis (OGIS) generalizes CEGIS.
- **Constraint-based (CEGIS)**: Iterates between a synthesizer proposing candidate programs and a verifier checking them against a specification. Counterexamples from the verifier guide the synthesizer. Introduced by Solar-Lezama (2006).
- **Neural/LLM-augmented**: Recent shift toward using LLMs as the synthesizer, with formal verification of outputs. AlphaCode, Codex, etc.
- **Version Space Algebras**: FlashMeta's approach — represent the set of all consistent programs compactly, intersect version spaces from different examples.

### CEGIS
- Original CEGIS paper (Solar-Lezama, 2006): https://people.csail.mit.edu/asolar/papers/thesis.pdf
- SyGuS competition (Syntax-Guided Synthesis): https://sygus.org/

### Reactive Synthesis
- Church's problem (1957) is the origin of reactive synthesis — synthesize a system that reacts to an environment. Modern tools like Strix and BoSy synthesize controllers from LTL specifications.
- Reactive Synthesis Survey: https://arxiv.org/pdf/2202.00394

## 8. Field Trends

A 2025 survey of interactive program synthesis (2015-2024, 50 papers) found that I/O examples dominated specifications in the late 2010s (66% of studies), but natural language surpassed PBE in 2021 and now represents 57% of approaches.

**Yoox occupies a unique niche**: more structured than natural language approaches, more behavioral than I/O examples, and more ambitious than ReDemon UI (no visual mockup needed).

- Survey PDF: https://assets.cureusjournals.com/artifacts/upload/review_article/pdf/5516/20250801-95152-u60hdm.pdf

## 9. Solar-Lezama Lecture Notes (Program Synthesis Course)

Summary of Armando Solar-Lezama's program synthesis lecture notes, organized by unit.

### Unit 1: Combinatorial Search and Inductive Synthesis
- **Lecture 1 (Intro)**: History from Turing to modern compilers. Three pillars: Intent, Invention, Adaptation.
- **Lecture 2 (Inductive Synthesis)**: PBE (inputs/outputs only) vs PBD (includes computation trace). Yoox is closer to PBD — traces include the sequence of interactions, not just final state.
- **Lecture 3 (Bottom-Up Search)**: Build programs from grammar terminals upward. Prune via observational equivalence (programs producing same outputs on given inputs are interchangeable).
- **Lecture 4 (Top-Down Search)**: Programs with "holes" filled progressively. Type-directed search rules out invalid fragments early.
- **Lecture 5 (Stochastic Search)**: MCMC methods for program search, useful for superoptimization.
- **Lecture 6 (Version Space Algebras)**: Symbolic representation of entire program sets rather than enumerating ASTs. Foundation of SMARTedit and FlashFill.
- **Lectures 7-8 (Sketch)**: Parametric programs P[c], requirements as constraints on c. Structural hashing and algebraic simplification reduce representation size.
- **Lecture 9 (Solving Constraints)**: Translation to CNF, solved by SAT solvers.

### Unit 2: Synthesis with Richer Specifications
- **Lecture 10 (Functional vs Reactive Synthesis)**: Functional = input→output mapping. Reactive = continuous interaction with environment. Yoox is firmly in the reactive camp.
- **Lecture 12 (Verification→Synthesis)**: Discovering loop invariants via parametric templates.
- **Lecture 13 (CEGIS)**: Counter-Example Guided Inductive Synthesis — synthesizer proposes, verifier checks, counterexamples refine.
- **Lecture 14 (SMT and SyGuS)**: SMT solvers for integers/arrays/strings. SyGuS standardizes synthesis problem format.
- **Lectures 15-16 (Refinement Types / Synquid)**: Types decorated with logical predicates. Prunes search by rejecting incomplete programs violating the type signature.
- **Lecture 17 (Deductive Synthesis)**: Semantics-preserving transformations of spec into implementation.
- **Lecture 18 (Deductive+Combinatorial Hybrids)**: Combining transformation rules with combinatorial search.
- **Lecture 19 (Abstract Interpretation)**: Abstract states (symbols for sets of concrete states) for verification and synthesis.

### Unit 3: Probabilistic and Neural Synthesis
- **Lecture 20 (Bayesian View)**: Synthesis as maximizing P(program | evidence). Handles underspecification.
- **Lecture 21 (Synthesis Under Distribution)**: Finding shortest or most likely program under a distribution.
- **Lecture 22 (Neural Guided Synthesis)**: NLP techniques (n-grams, neural nets) for program distributions. Neural networks predict fragments, symbolic solvers fill holes.

### Relevance to Yoox
- Yoox is **PBD** (Programming by Demonstration), not PBE — traces include interaction sequences.
- Yoox is **reactive synthesis** — continuous user-environment interaction, not one-shot input→output.
- **Version Space Algebras** could represent the set of all state machines consistent with traces.
- **CEGIS** could drive iterative refinement: synthesize a candidate app, find a trace it doesn't satisfy, refine.
- **Top-down search with holes** maps naturally to Yoox's component composition: start with the top-level intent, decompose into sub-intents (holes), fill with components.

---

## Key Takeaways for Yoox

1. **ReDemon UI is the closest prior work**, but Yoox is more ambitious — synthesizes both state logic and UI from purely behavioral (non-visual) traces.
2. **The POPL 2023 "Combining Functional and Automata Synthesis" paper** is the most technically relevant, directly addressing synthesizing reactive programs with state machines from interaction traces.
3. **Automata learning algorithms** (L*, state merging, AALpy) are mature tools for inferring state machines from traces and could serve as the algorithmic backbone of Yoox's synthesis step.
4. **Syren (PLDI 2025)** demonstrates that synthesis from positive-only partial traces is feasible, using cost-based ranking to avoid over-generalization.
5. **XState/Statecharts** provide a natural intermediate representation for the synthesized app model, with existing tooling for visualization, testing, and multi-framework code generation.
6. **FlashFill's DSL design principles** (invertible/enumerable operators, divide-and-conquer, cost-based ranking) offer proven strategies for making synthesis tractable within Yoox's `.ux` trace language.
