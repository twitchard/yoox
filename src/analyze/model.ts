// App model type definitions

export type YooxType =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "bool" }
  | { kind: "nil" }
  | { kind: "symbol"; values: string[] }
  | { kind: "list"; element: YooxType }
  | { kind: "record"; name: string; fields: YooxType[] }
  | { kind: "union"; types: YooxType[] }
  | { kind: "unknown" };

export interface StateVar {
  name: string;
  type: YooxType;
  initialValue: unknown;
}

export interface ActionParam {
  name: string;
  type: YooxType;
}

export interface Action {
  name: string;
  params: ActionParam[];
}

export interface DerivedProperty {
  name: string;
  type: YooxType;
  derivation: string; // human-readable description of how it's derived
  dependsOn: string[];
}

export interface Route {
  method: string;
  path: string;
}

export interface AppModel {
  stateVars: StateVar[];
  actions: Action[];
  derived: DerivedProperty[];
  routes: Route[];
  constructors: Map<string, number>; // constructor name -> arity
}
