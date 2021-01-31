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
  namespace Jomql {
    interface ObjectTypeDefinitionField {}
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

export interface InputFieldDefinition {
  type: JomqlScalarType | JomqlInputType | JomqlInputTypeLookup;
  required?: boolean;
  isArray?: boolean;
}

export interface InputTypeDefinition {
  name: string;
  description?: string;
  fields: {
    [x: string]: JomqlInputFieldType;
  };
  inputsValidator?: (args: any, fieldPath: string[]) => void;
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
  isArray?: boolean;
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
  query: JomqlQuery;
  argsTransformer?: (req: Request) => any;
}

export interface ObjectTypeDefinitionField
  extends ResolverObject,
    Jomql.ObjectTypeDefinitionField {
  resolver?: ResolverFunction;
  defer?: boolean;
  required?: boolean;
  hidden?: boolean;
  deleter?: Function;
  setter?: Function;
  updater?: Function;
}

export type JsType = "string" | "number" | "boolean" | "unknown";

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
  parentValue: any;
  fieldValue: any;
  data?: any;
}

export type ResolverFunction = (input: ResolverFunctionInput) => any;

export interface JomqlResolverNode {
  typeDef: ObjectTypeDefinitionField | RootResolverDefinition;
  query?: JomqlQuery;
  args?: JomqlQueryArgs;
  nested?: {
    [x: string]: JomqlResolverNode;
  };
}

export type JomqlQuery =
  | unknown
  | {
      [y: string]: any;
      __args?: JomqlQueryArgs;
    };

export interface JomqlQueryArgs {
  [x: string]: JomqlQueryArgs | undefined;
}

export type JomqlResultsNode = null | {
  [x: string]: JomqlResultsNode | any;
};

export function isRootResolverDefinition(
  ele: RootResolverDefinition | ObjectTypeDefinitionField
): ele is RootResolverDefinition {
  return "name" in ele;
}
