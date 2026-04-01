"""
Inference Engine: traces → AbstractApp

Processes parsed traces to infer:
  - State fields and types
  - Initial values
  - Action signatures
  - Action effects (from before/after observation pairs)
  - Entity definitions
  - Derived properties
"""

from trace_parser import parse_trace, PageLoad, Assert, Action, Symbol, Constructor
from abstract_app import (
    AbstractApp, StateField, ActionDef, ActionArg, DerivedDef, EntityDef,
    register_entity_fields,
)


def infer_type(value) -> str:
    if isinstance(value, int): return "int"
    if isinstance(value, str): return "string"
    if isinstance(value, bool): return "bool"
    if isinstance(value, list): return "list"
    if isinstance(value, Symbol): return "enum"
    if isinstance(value, Constructor): return "entity"
    if value is None: return "nullable"
    return "unknown"


def infer_arg_type(arg) -> tuple[str, dict]:
    """Returns (type_name, extra_info)."""
    if isinstance(arg, str):
        return "string", {}
    if isinstance(arg, int):
        return "int", {}
    if isinstance(arg, Symbol):
        return "enum", {"value": arg.name}
    if isinstance(arg, tuple) and arg[0] == 'index':
        return "index", {"collection": arg[2]}
    return "unknown", {}


def infer_entity(constructor: Constructor) -> EntityDef:
    """Infer entity definition from a Constructor value."""
    fields = {}
    # Heuristic: try to name fields based on type
    for i, arg in enumerate(constructor.args):
        if isinstance(arg, Symbol):
            fields[f"field_{i}"] = "enum"
        elif isinstance(arg, str):
            fields[f"field_{i}"] = "string"
        elif isinstance(arg, int):
            fields[f"field_{i}"] = "int"
        elif isinstance(arg, bool):
            fields[f"field_{i}"] = "bool"
    return EntityDef(constructor.name, fields)


class InferenceEngine:
    def __init__(self):
        self.app = AbstractApp()
        self.observed_values: dict[str, list] = {}  # name → list of (context, value)
        self.action_observations: list = []  # (action, state_before, state_after, asserted_after)
        self.enum_values: dict[str, set] = {}  # observable → set of enum values seen
        self.action_arg_types: dict[str, list[dict]] = {}  # action → [arg_info]
        self.directly_set_by_action: set = set()  # observables that change after actions
        self._initial_hints: dict[str, Any] = {}  # name → initial value (from pass 1)

    def process_traces(self, traces: list[list]) -> AbstractApp:
        """Process multiple traces and infer the abstract app."""
        # Two passes:
        # Pass 1: collect all observations to learn initial values
        # Pass 2: process actions with proper before-states
        all_parsed = traces

        # Pass 1: just collect initial values from assertions
        for trace in all_parsed:
            self._collect_initial_values(trace)

        # Pass 2: full processing with known initial state
        for trace in all_parsed:
            self._process_single_trace(trace)

        self._infer_state_fields()
        # Infer derived BEFORE actions, so effects can exclude derived fields
        self._infer_derived()
        # Multi-pass action inference: synthesize what we can, then resimulate
        self._infer_actions()
        # Pass 3: re-simulate traces with synthesized effects to get better
        # before/after pairs for actions that couldn't be synthesized
        self._resimulate_and_reinfer(all_parsed)
        return self.app

    def _resimulate_and_reinfer(self, traces):
        """Re-simulate traces using known effects, collect better before/after pairs."""
        unsynthesized = [name for name, action in self.app.actions.items()
                         if self._is_fallback_effect(action.effect)]
        if not unsynthesized:
            return

        # Clear old observations for unsynthesized actions and re-collect
        old_observations = self.action_observations
        self.action_observations = []

        for trace_nodes in traces:
            state = dict(self.app.initial_state)
            for i, node in enumerate(trace_nodes):
                from trace_parser import PageLoad, Assert, Action
                if isinstance(node, PageLoad):
                    state = dict(self.app.initial_state)
                elif isinstance(node, Assert):
                    # Use assertion to correct state (ground truth)
                    # Convert to runtime value so effects can work with it
                    state[node.name] = self._to_runtime_value(node.value)
                elif isinstance(node, Action):
                    state_before = dict(state)

                    # Try to apply known effect
                    if node.name in self.app.actions and not self._is_fallback_effect(self.app.actions[node.name].effect):
                        resolved_args = []
                        for arg in node.args:
                            if isinstance(arg, tuple) and arg[0] == 'index':
                                resolved_args.append(arg[1])
                            else:
                                resolved_args.append(arg)
                        state = self.app.actions[node.name].effect(dict(state), *resolved_args)

                    # Collect assertions after this action
                    state_after = dict(state)
                    asserted_after = set()
                    j = i + 1
                    while j < len(trace_nodes) and isinstance(trace_nodes[j], Assert):
                        rv = self._to_runtime_value(trace_nodes[j].value)
                        state_after[trace_nodes[j].name] = rv  # runtime values
                        asserted_after.add(trace_nodes[j].name)
                        state[trace_nodes[j].name] = rv
                        j += 1

                    if node.name in unsynthesized:
                        self.action_observations.append((node, state_before, state_after, asserted_after))

        # Re-infer unsynthesized actions
        for name in unsynthesized:
            args = self.app.actions[name].args
            effect = self._synthesize_effect(name, args)
            if not self._is_fallback_effect(effect):
                self.app.actions[name] = ActionDef(name, args, effect)

    def _is_fallback_effect(self, effect) -> bool:
        """Check if an effect is the fallback no-op lambda."""
        try:
            # Try calling with just state — fallback accepts this (no extra args)
            test_state = dict(self.app.initial_state)
            result = effect(test_state)
            return result == test_state
        except (TypeError, KeyError):
            return False

    def _collect_initial_values(self, nodes: list):
        """First pass: collect initial values from post-PageLoad assertions."""
        after_page_load = False
        for node in nodes:
            if isinstance(node, PageLoad):
                after_page_load = True
                continue
            if after_page_load and isinstance(node, Assert):
                # This is an initial value assertion
                if node.name not in self._initial_hints:
                    self._initial_hints[node.name] = node.value
            elif isinstance(node, Action):
                after_page_load = False  # stop collecting initials after first action

    def _process_single_trace(self, nodes: list):
        """Walk through one trace, collecting observations."""
        current_obs = {}  # latest observed values

        for i, node in enumerate(nodes):
            if isinstance(node, PageLoad):
                # Seed with known initial values from pass 1
                current_obs = {}
                for name, val in self._initial_hints.items():
                    current_obs[name] = val

            elif isinstance(node, Assert):
                if node.name not in self.observed_values:
                    self.observed_values[node.name] = []
                self.observed_values[node.name].append(node.value)

                # Track enum values
                if isinstance(node.value, Symbol):
                    self.enum_values.setdefault(node.name, set()).add(node.value.name)

                # Detect entities in lists
                if isinstance(node.value, list):
                    for item in node.value:
                        if isinstance(item, Constructor):
                            self._register_entity(item)

                current_obs[node.name] = node.value

            elif isinstance(node, Action):
                state_before = dict(current_obs)

                # Record arg types
                if node.name not in self.action_arg_types:
                    self.action_arg_types[node.name] = []
                arg_infos = []
                for arg in node.args:
                    atype, extra = infer_arg_type(arg)
                    arg_infos.append({"type": atype, **extra})
                if arg_infos:
                    self.action_arg_types[node.name] = arg_infos

                # Look ahead for assertions to build state_after
                state_after = dict(current_obs)
                asserted_after = set()  # fields actually asserted after this action
                j = i + 1
                while j < len(nodes) and isinstance(nodes[j], Assert):
                    state_after[nodes[j].name] = nodes[j].value
                    asserted_after.add(nodes[j].name)
                    j += 1

                self.action_observations.append((node, state_before, state_after, asserted_after))

                # Track which observables change
                for key in state_after:
                    if key in state_before and state_before[key] != state_after[key]:
                        self.directly_set_by_action.add(key)

                # Update current_obs with after-state
                current_obs.update(state_after)

    def _register_entity(self, constructor: Constructor):
        if constructor.name not in self.app.entities:
            entity = infer_entity(constructor)
            self.app.entities[constructor.name] = entity

    def _infer_state_fields(self):
        """Infer state fields from observed values."""
        for name, values in self.observed_values.items():
            if not values:
                continue
            first = values[0]
            typ = infer_type(first)

            sf = StateField(name, typ)
            if typ == "enum":
                sf.enum_values = sorted(self.enum_values.get(name, set()))

            self.app.state_fields[name] = sf

            # Initial value = first value seen after PageLoad (i.e., first in list)
            self.app.initial_state[name] = self._to_runtime_value(first)

    def _infer_actions(self):
        """Infer action definitions from observations."""
        seen_actions = {}
        for action_node, before, after, asserted in self.action_observations:
            if action_node.name in seen_actions:
                continue  # already inferred
            seen_actions[action_node.name] = True

            # Build args
            args = []
            arg_infos = self.action_arg_types.get(action_node.name, [])
            for k, info in enumerate(arg_infos):
                atype = info["type"]
                arg = ActionArg(f"arg{k}", atype)
                if atype == "index":
                    arg.index_of = info.get("collection", "")
                if atype == "enum":
                    # Collect all enum values seen for this arg position
                    arg.enum_values = sorted(self._collect_enum_arg_values(action_node.name, k))
                args.append(arg)

            # Build effect function by analyzing before/after
            effect = self._synthesize_effect(action_node.name, args)

            self.app.actions[action_node.name] = ActionDef(action_node.name, args, effect)

    def _collect_enum_arg_values(self, action_name, arg_pos) -> set:
        values = set()
        for action_node, _, _, _ in self.action_observations:
            if action_node.name == action_name and arg_pos < len(action_node.args):
                arg = action_node.args[arg_pos]
                if isinstance(arg, Symbol):
                    values.add(arg.name)
        return values

    def _synthesize_effect(self, action_name, args) -> callable:
        """Synthesize an effect function from before/after pairs.

        This is the hard part. For now, use pattern matching on simple cases:
        - Scalar increment/decrement
        - List append
        - Field mutation on list items
        - Direct assignment (enum fields)
        """
        # Collect all before/after pairs for this action (only with actual assertions)
        pairs = []
        for action_node, before, after, asserted in self.action_observations:
            if action_node.name == action_name:
                pairs.append((action_node.args, before, after, asserted))

        if not pairs:
            return lambda state: state

        # Find which stored fields change (exclude derived properties)
        # Only consider fields that were actually asserted after the action
        derived_names = set(self.app.derived.keys())
        changed_fields = set()
        for action_args, before, after, asserted in pairs:
            for key in asserted:
                if key in derived_names:
                    continue  # skip derived — they change as a consequence, not directly
                if key in before and not self._values_match(before[key], after[key]):
                    changed_fields.add(key)

        if not changed_fields:
            return lambda state: state

        # --- Pattern: scalar increment/decrement ---
        if len(changed_fields) == 1 and not args:
            field_name = list(changed_fields)[0]
            deltas = []
            for _, before, after, _ in pairs:
                if field_name in before and field_name in after:
                    bv = before[field_name]
                    av = after[field_name]
                    if isinstance(bv, int) and isinstance(av, int):
                        deltas.append(av - bv)
            if deltas and all(d == deltas[0] for d in deltas):
                delta = deltas[0]
                return lambda state, _d=delta, _f=field_name: {**state, _f: state[_f] + _d}

        # --- Pattern: list append (action takes a string arg) ---
        if args and args[0].type == "string":
            # Check if a list field grows by one element
            for field_name in changed_fields:
                list_appends = True
                has_evidence = False
                for action_args, before, after, asserted in pairs:
                    if field_name not in asserted:
                        continue  # no assertion for this field after this action — skip
                    has_evidence = True
                    bv = before.get(field_name, [])
                    av = after.get(field_name, [])
                    if not isinstance(bv, list) or not isinstance(av, list):
                        list_appends = False
                        break
                    if len(av) != len(bv) + 1:
                        list_appends = False
                        break
                if not has_evidence:
                    list_appends = False
                if list_appends:
                    # Figure out what gets appended
                    # Look at the first Constructor in the entities
                    entity_name = None
                    for ename in self.app.entities:
                        entity_name = ename
                        break

                    if entity_name:
                        entity = self.app.entities[entity_name]
                        field_names = list(entity.fields.keys())
                        register_entity_fields(entity_name, field_names)

                        def make_append_effect(fname, ename, fnames):
                            def effect(state, text):
                                text = text.strip()
                                if not text:
                                    return state
                                new_item = {"type": ename}
                                # First field = default status, second = the text
                                if len(fnames) >= 2:
                                    new_item[fnames[0]] = "active"  # default status
                                    new_item[fnames[1]] = text
                                return {**state, fname: state[fname] + [new_item]}
                            return effect

                        return make_append_effect(field_name, entity_name, field_names)

        # --- Pattern: index-arg actions (mutation or deletion) ---
        if args and args[0].type == "index":
            for field_name in changed_fields:
                for action_args, before, after, asserted in pairs:
                    if field_name not in asserted:
                        continue
                    bv = before.get(field_name, [])
                    av = after.get(field_name, [])
                    if not isinstance(bv, list) or not isinstance(av, list):
                        continue

                    idx = action_args[0] if isinstance(action_args[0], int) else action_args[0][1]

                    # Sub-pattern: list removal (list shrinks by 1)
                    if len(av) == len(bv) - 1:
                        def make_remove_effect(list_field):
                            def effect(state, index):
                                new_list = list(state[list_field])
                                if index < len(new_list):
                                    new_list.pop(index)
                                return {**state, list_field: new_list}
                            return effect
                        return make_remove_effect(field_name)

                    # Sub-pattern: field mutation (list same length, one item differs)
                    if len(bv) == len(av) and idx < len(bv) and idx < len(av):
                        old_item = bv[idx]
                        new_item = av[idx]

                        # Handle Constructor objects
                        if isinstance(old_item, Constructor) and isinstance(new_item, Constructor):
                            for k, (oa, na) in enumerate(zip(old_item.args, new_item.args)):
                                if oa != na:
                                    new_val = na.name if isinstance(na, Symbol) else na
                                    entity = self.app.entities.get(old_item.name)
                                    if entity:
                                        fnames = list(entity.fields.keys())
                                        register_entity_fields(old_item.name, fnames)
                                        if k < len(fnames):
                                            target_field = fnames[k]
                                            def make_mutate_effect(list_field, target_f, new_v):
                                                def effect(state, index):
                                                    new_list = list(state[list_field])
                                                    if index < len(new_list):
                                                        item = dict(new_list[index])
                                                        item[target_f] = new_v
                                                        new_list[index] = item
                                                    return {**state, list_field: new_list}
                                                return effect
                                            return make_mutate_effect(field_name, target_field, new_val)

                        # Handle dict objects (from resimulation pass)
                        if isinstance(old_item, dict) and isinstance(new_item, dict):
                            for key in new_item:
                                if old_item.get(key) != new_item.get(key):
                                    new_val = new_item[key]
                                    if isinstance(new_val, Symbol):
                                        new_val = new_val.name
                                    def make_mutate_effect(list_field, target_f, new_v):
                                        def effect(state, index):
                                            new_list = list(state[list_field])
                                            if index < len(new_list):
                                                item = dict(new_list[index])
                                                item[target_f] = new_v
                                                new_list[index] = item
                                            return {**state, list_field: new_list}
                                        return effect
                                    return make_mutate_effect(field_name, key, new_val)

        # --- Pattern: enum assignment (action takes enum arg) ---
        if args and args[0].type == "enum":
            for field_name in changed_fields:
                for action_args, before, after, asserted in pairs:
                    arg_val = action_args[0]
                    if isinstance(arg_val, Symbol):
                        av = after.get(field_name)
                        if isinstance(av, Symbol) and av.name == arg_val.name:
                            def make_assign_effect(fname):
                                def effect(state, val):
                                    return {**state, fname: val}
                                return effect
                            return make_assign_effect(field_name)

        # Fallback: identity
        print(f"  WARNING: Could not synthesize effect for {action_name}, changed: {changed_fields}")
        return lambda state, *args: state

    def _values_match(self, a, b) -> bool:
        """Check if two trace values are the same."""
        if a == b: return True
        if isinstance(a, list) and isinstance(b, list):
            if len(a) != len(b): return False
            return all(self._values_match(x, y) for x, y in zip(a, b))
        return False

    def _to_runtime_value(self, value):
        """Convert a parsed trace value to a runtime value."""
        if isinstance(value, Symbol):
            return value.name
        if isinstance(value, Constructor):
            entity = self.app.entities.get(value.name)
            if entity:
                fnames = list(entity.fields.keys())
                result = {"type": value.name}
                for i, arg in enumerate(value.args):
                    if i < len(fnames):
                        result[fnames[i]] = self._to_runtime_value(arg)
                return result
            return value
        if isinstance(value, list):
            return [self._to_runtime_value(v) for v in value]
        return value

    def _infer_derived(self):
        """Infer which observables are derived (never directly set by actions).

        A derived property is one that:
        1. Is observed in traces (appears in assertions)
        2. Changes in response to actions
        3. But can be computed from other state
        """
        # For now, simple heuristic: if an observable's name contains "Count" or
        # "remaining" or "completed" and there's a list field, try to infer the derivation
        for name, sf in list(self.app.state_fields.items()):
            if sf.type == "int" and name != "count":
                # Likely a derived count — but we need the list field to derive from
                list_fields = [n for n, f in self.app.state_fields.items() if f.type == "list"]
                if list_fields:
                    list_field = list_fields[0]
                    # Try to figure out the filter predicate from observed values
                    derivation = self._try_infer_count_derivation(name, list_field)
                    if derivation:
                        self.app.derived[name] = derivation
                        # Remove from state_fields (it's derived, not stored)
                        del self.app.state_fields[name]
                        if name in self.app.initial_state:
                            del self.app.initial_state[name]

    def _try_infer_count_derivation(self, count_name, list_field) -> DerivedDef | None:
        """Try to infer a count derivation like remainingCount = count(todos where status == active)."""
        # Check all observation pairs: does count_name == count of items matching some predicate?
        # We need to check across action observations
        for action_node, before, after, _ in self.action_observations:
            count_val = None
            list_val = None
            for node_list in [before, after]:
                if count_name in node_list:
                    count_val = node_list[count_name]
                if list_field in node_list:
                    list_val = node_list[list_field]

        # Simple heuristic: "remaining" → count where status == active
        if "remaining" in count_name.lower():
            def compute(state, _lf=list_field):
                items = state.get(_lf, [])
                return sum(1 for item in items
                           if isinstance(item, dict) and item.get("field_0") == "active")
            return DerivedDef(count_name, compute)

        if "completed" in count_name.lower():
            def compute(state, _lf=list_field):
                items = state.get(_lf, [])
                return sum(1 for item in items
                           if isinstance(item, dict) and item.get("field_0") == "completed")
            return DerivedDef(count_name, compute)

        return None


def infer_app(trace_texts: list[str]) -> AbstractApp:
    """Main entry point: parse traces and infer an AbstractApp."""
    engine = InferenceEngine()
    parsed_traces = [parse_trace(t) for t in trace_texts]
    return engine.process_traces(parsed_traces)
