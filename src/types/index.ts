import type { Request } from "express";

// extendable by user
declare global {
  namespace Jomql {
    interface TypeDefinitionField {}
  }
}

export type ValidMethod =
  | "all"
  | "get"
  | "post"
  | "put"
  | "delete"
  | "patch"
  | "options"
  | "head";

export interface JomqlResponse {
  data: any;
  error?: JomqlError;
}

export interface JomqlError {
  message: string;
  fieldPath?: string[];
  stack?: string;
}

export interface Params {
  readonly schema: Schema;
  readonly debug?: boolean;
  readonly lookupValue?: string | boolean | number;
  readonly jomqlPath?: string;
  readonly customProcessor?: boolean;
}

export type JomqlProcessorFunction = (
  params: JomqlProcessorFunctionInputs
) => Promise<any>;

export type JomqlProcessorFunctionInputs = {
  jomqlResultsNode: unknown;
  jomqlResolverNode: JomqlResolverNode;
  parentNode?: unknown;
  req: Request;
  data?: any;
  fieldPath: string[];
};

export interface ArgDefinition {
  type: ScalarDefinition | InputTypeDefinition | string;
  required?: boolean;
  isArray?: boolean;
}

export interface InputTypeDefinition {
  name?: string;
  fields: {
    [x: string]: ArgDefinition;
  };
  inputsValidator?: (args: any, fieldPath: string[]) => void;
}

export interface TypeDefinition {
  name: string;
  description?: string;
  fields: {
    [x: string]: TypeDefinitionField;
  } & { __args?: never };
}

export interface ResolverObject {
  type: string | ScalarDefinition | TypeDefinition;
  isArray?: boolean;
  allowNull: boolean;
  args?: ArgDefinition;
  description?: string;
}

export interface RootResolverObject extends ResolverObject {
  method: ValidMethod;
  route: string;
  query?: JomqlQuery;
  resolver: RootResolverFunction;
}

export type RootResolverMap = Map<string, RootResolverObject>;

export interface TypeDefinitionField
  extends ResolverObject,
    Jomql.TypeDefinitionField {
  resolver?: ResolverFunction;
  defer?: boolean;
  required?: boolean;
  hidden?: boolean;
  deleter?: Function;
  setter?: Function;
  updater?: Function;
}

export type JsType = "string" | "number" | "boolean" | "unknown";

export interface Schema {
  rootResolvers: RootResolverMap;
  typeDefs: Map<string, TypeDefinition>;
  inputDefs: Map<string, InputTypeDefinition>;
  scalars: {
    [x: string]: ScalarDefinition;
  };
}

export interface ScalarDefinition {
  name: string;
  description?: string;
  types: string[];
  serialize?: ScalarDefinitionFunction;
  parseValue?: ScalarDefinitionFunction;
}

export type ScalarDefinitionFunction = (value: unknown) => any;

export interface RootResolverFunctionInput {
  req: Request;
  fieldPath: string[];
  args: any;
  query?: JomqlQuery;
}

export type RootResolverFunction = (input: RootResolverFunctionInput) => any;

export interface ResolverFunctionInput {
  req: Request;
  fieldPath: string[];
  args: any;
  query: JomqlQuery | undefined;
  // typename: string;
  parentValue: any;
  fieldValue: any;
  data?: any;
}

export type ResolverFunction = (input: ResolverFunctionInput) => any;

export interface JomqlResolverNode {
  typeDef: TypeDefinitionField;
  query?: JomqlQuery;
  args?: JomqlQueryArgs;
  // typename: string;
  nested?: {
    [x: string]: JomqlResolverNode;
  };
}

export interface JomqlQuery {
  [y: string]: any;
  __args?: JomqlQueryArgs;
}

export interface JomqlQueryArgs {
  [x: string]: JomqlQueryArgs | undefined;
}

export type JomqlResultsNode = null | {
  [x: string]: JomqlResultsNode | any;
};

export function isScalarDefinition(
  ele: string | ScalarDefinition
): ele is ScalarDefinition {
  return typeof ele !== "string";
}

export function isTypeDefinition(
  ele: ScalarDefinition | TypeDefinition
): ele is TypeDefinition {
  return "fields" in ele;
}

export function isTypeDefinitionField(
  ele: TypeDefinitionField | RootResolverObject
): ele is TypeDefinitionField {
  return !("method" in ele);
}

export function isInputTypeDefinition(
  ele: InputTypeDefinition | ScalarDefinition | string
): ele is InputTypeDefinition {
  return typeof ele !== "string" && !("types" in ele);
}
