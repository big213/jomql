import type { Request } from "express";
import {
  JomqlInputType,
  JomqlScalarType,
  JomqlObjectType,
  JomqlInputTypeLookup,
  JomqlObjectTypeLookup,
  JomqlInputFieldType,
} from "../classes";

// extendable by user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Jomql {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface ObjectTypeDefinitionField {}
  }
}

export type StringKeyObject = { [x: string]: unknown };

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
  data: unknown;
  error?: JomqlError;
}

export interface JomqlError {
  message: string;
  fieldPath?: string[];
  stack?: string;
}

export interface Params {
  readonly debug?: boolean;
  readonly lookupValue?: string | boolean | number | null;
  readonly jomqlPath?: string;
  readonly processEntireTree?: boolean;
}

export type JomqlProcessorFunction = (
  params: JomqlProcessorFunctionInputs
) => Promise<unknown>;

export type JomqlProcessorFunctionInputs = {
  jomqlResultsNode?: unknown;
  jomqlResolverNode: JomqlResolverNode;
  parentNode?: unknown;
  req: Request;
  data?: any;
  fieldPath: string[];
  fullTree?: boolean;
};

export interface InputFieldDefinition {
  type: JomqlScalarType | JomqlInputType | JomqlInputTypeLookup;
  required?: boolean;
  arrayOptions?: ArrayOptions;
  allowNull?: boolean;
}

export interface ArrayOptions {
  allowNullElement: boolean;
}

export interface InputTypeDefinition {
  name: string;
  description?: string;
  fields: {
    [x: string]: JomqlInputFieldType;
  };
  inputsValidator?: (args: unknown, fieldPath: string[]) => void;
}

export interface ObjectTypeDefinition {
  name: string;
  description?: string;
  fields: {
    [x: string]: ObjectTypeDefinitionField;
  } & { __args?: never };
}

export interface ResolverObject {
  type: JomqlObjectTypeLookup | JomqlScalarType | JomqlObjectType;
  arrayOptions?: ArrayOptions;
  allowNull: boolean;
  args?: JomqlInputFieldType;
  description?: string;
}

export interface RootResolverDefinition extends ResolverObject {
  name: string;
  restOptions?: RestOptions;
  resolver: RootResolverFunction;
}

export interface RestOptions {
  method: ValidMethod;
  route: string;
  query?: unknown;
  argsTransformer?: (req: Request) => unknown;
}

export interface ObjectTypeDefinitionField
  extends ResolverObject,
    Jomql.ObjectTypeDefinitionField {
  resolver?: ResolverFunction;
  defer?: boolean;
  required?: boolean;
  hidden?: boolean;
}

export type JsType = "string" | "number" | "boolean" | "unknown";

export interface ScalarDefinition {
  name: string;
  description?: string;
  types: string[];
  serialize?: ScalarDefinitionFunction;
  parseValue?: ScalarDefinitionFunction;
}

export type ScalarDefinitionFunction = (value: unknown) => unknown;

export interface RootResolverFunctionInput {
  req: Request;
  fieldPath: string[];
  args: unknown;
  query?: unknown;
}

export type RootResolverFunction = (
  input: RootResolverFunctionInput
) => unknown;

export interface ResolverFunctionInput {
  req: Request;
  fieldPath: string[];
  args: unknown;
  query: unknown;
  parentValue: any;
  fieldValue: unknown;
  data?: any;
}

export type ResolverFunction = (input: ResolverFunctionInput) => unknown;

export interface JomqlResolverNode {
  typeDef: ObjectTypeDefinitionField | RootResolverDefinition;
  query?: unknown;
  args?: unknown;
  nested?: {
    [x: string]: JomqlResolverNode;
  };
}

export type JomqlResultsNode = unknown;

export function isRootResolverDefinition(
  ele: RootResolverDefinition | ObjectTypeDefinitionField
): ele is RootResolverDefinition {
  return "name" in ele;
}
