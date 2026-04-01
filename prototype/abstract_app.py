"""
Abstract Application: the modality-independent core.

An AbstractApp is an LTS (labeled transition system) with:
  - state schema (name → type)
  - initial state
  - actions (name → args + effect function)
  - derived properties (name → computation from state)
  - observations (what the user can see)
"""

from dataclasses import dataclass, field
from typing import Any, Callable
from trace_parser import Symbol, Constructor


@dataclass
class StateField:
    name: str
    type: str       # "int", "string", "bool", "list", "enum"
    enum_values: list[str] = field(default_factory=list)  # for enum type


@dataclass
class ActionArg:
    name: str
    type: str       # "string", "int", "index", "enum"
    index_of: str = ""          # for index type: which collection
    enum_values: list[str] = field(default_factory=list)  # for enum type


@dataclass
class ActionDef:
    name: str
    args: list[ActionArg]
    effect: Callable  # (state, *args) → new_state


@dataclass
class DerivedDef:
    name: str
    compute: Callable  # (state) → value


@dataclass
class EntityDef:
    name: str
    fields: dict[str, str]  # field_name → type


@dataclass
class AbstractApp:
    state_fields: dict[str, StateField] = field(default_factory=dict)
    initial_state: dict[str, Any] = field(default_factory=dict)
    actions: dict[str, ActionDef] = field(default_factory=dict)
    derived: dict[str, DerivedDef] = field(default_factory=dict)
    entities: dict[str, EntityDef] = field(default_factory=dict)

    def get_initial_state(self) -> dict:
        return dict(self.initial_state)

    def apply_action(self, state: dict, action_name: str, args: list) -> dict:
        action = self.actions[action_name]
        return action.effect(dict(state), *args)

    def observe(self, state: dict) -> dict:
        """Return all observable values (stored + derived)."""
        obs = dict(state)
        for name, derived in self.derived.items():
            obs[name] = derived.compute(state)
        return obs

    def validate_trace(self, trace_nodes: list) -> tuple[bool, str]:
        """Run a trace against this abstract app. Returns (success, message)."""
        state = self.get_initial_state()

        for i, node in enumerate(trace_nodes):
            from trace_parser import PageLoad, Assert, Action

            if isinstance(node, PageLoad):
                state = self.get_initial_state()

            elif isinstance(node, Assert):
                obs = self.observe(state)
                if node.name not in obs:
                    return False, f"Step {i}: observable '{node.name}' not found. Have: {list(obs.keys())}"
                actual = obs[node.name]
                if not values_equal(actual, node.value):
                    return False, f"Step {i}: {node.name} == {node.value!r}, but got {actual!r}"

            elif isinstance(node, Action):
                if node.name not in self.actions:
                    return False, f"Step {i}: action '{node.name}' not found. Have: {list(self.actions.keys())}"
                # Resolve index args
                resolved_args = []
                for arg in node.args:
                    if isinstance(arg, tuple) and arg[0] == 'index':
                        # (index, n, collection_name)
                        resolved_args.append(arg[1])  # just the index number
                    else:
                        resolved_args.append(arg)
                state = self.apply_action(state, node.name, resolved_args)

        return True, "All assertions passed"


def values_equal(actual, expected) -> bool:
    """Compare values across representations (Constructor vs dict, Symbol vs string, etc.)."""
    if actual == expected:
        return True

    # Compare lists element-wise
    if isinstance(actual, list) and isinstance(expected, list):
        if len(actual) != len(expected):
            return False
        return all(values_equal(a, e) for a, e in zip(actual, expected))

    # Compare Constructor with dict-like representation
    if isinstance(expected, Constructor) and isinstance(actual, dict):
        # Constructor("Todo", (Symbol("active"), "Buy milk"))
        # vs dict {"type": "Todo", "status": "active", "label": "Buy milk"}
        if actual.get("type") != expected.name:
            return False
        # Match positional args to known field order
        entity_fields = _FIELD_ORDER.get(expected.name, [])
        for j, arg in enumerate(expected.args):
            if j < len(entity_fields):
                field_name = entity_fields[j]
                if not values_equal(actual.get(field_name), arg):
                    return False
        return True

    # Compare Symbol with string
    if isinstance(expected, Symbol) and isinstance(actual, str):
        return actual == expected.name

    if isinstance(actual, Symbol) and isinstance(expected, str):
        return actual.name == expected

    return False


# Field order for known entity types (set during inference)
_FIELD_ORDER: dict[str, list[str]] = {}

def register_entity_fields(name: str, fields: list[str]):
    _FIELD_ORDER[name] = fields
