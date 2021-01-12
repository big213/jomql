import type { Request } from "express";

export function isScalarDefinition(
  ele: string | ScalarDefinition
): ele is ScalarDefinition {
  return typeof ele !== "string";
}

export function isInputTypeDefinition(
  ele: InputTypeDefinition | ScalarDefinition | string
): ele is InputTypeDefinition {
  return typeof ele !== "string" && !("types" in ele);
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

export type JomqlResponse = {
  data: any;
  error?: JomqlError;
};

export type JomqlError = {
  message: string;
  stack?: string;
};

export type Params = {
  readonly schema: Schema;
  readonly debug?: boolean;
  readonly lookupValue?: string | boolean | number;
  readonly jomqlPath?: string;
};

export type ArgDefinition = {
  type: ScalarDefinition | InputTypeDefinition | string;
  required?: boolean;
  isArray?: boolean;
};

export type InputTypeDefinition = {
  name?: string;
  fields: {
    [x: string]: ArgDefinition;
  };
  inputsValidator?: (args: any, fieldPath: string[]) => void;
};

export type TypeDefinition = {
  description?: string;
  fields: {
    [x: string]: TypeDefinitionField;
  } & { __args?: never };
};

export type ResolverObject = {
  type: string | ScalarDefinition;
  isArray?: boolean;
  allowNull: boolean;
  args?: ArgDefinition;
  resolver?: ResolverFunction;
  description?: string;
};

export type RootResolverObject = ResolverObject & {
  method: ValidMethod;
  route: string;
  resolver: ResolverFunction;
};

export type RootResolverMap = Map<string, RootResolverObject>;

export type TypeDefinitionField = ResolverObject & {
  customOptions?: {
    [x: string]: any;
  };
  required?: boolean;
  hidden?: boolean;
  dataloader?: Function;
  deleter?: Function;
  setter?: Function;
  updater?: Function;
};

export type JsType = "string" | "number" | "boolean" | "unknown";

export type Schema = {
  rootResolvers: RootResolverMap;
  typeDefs: Map<string, TypeDefinition>;
  inputDefs: Map<string, InputTypeDefinition>;
  scalars: {
    [x: string]: ScalarDefinition;
  };
};

export type ScalarDefinition = {
  name: string;
  description?: string;
  types: string[];
  serialize?: ScalarDefinitionFunction;
  parseValue?: ScalarDefinitionFunction;
};

export type ScalarDefinitionFunction = (
  value: unknown,
  fieldPath: string[]
) => any;

export type ResolverFunction = (
  req: Request,
  args?: any,
  query?: JomqlQuery,
  typename?: string,
  currentObject?: any,
  fieldPath?: string[]
) => any;

export type JomqlResolverNode = {
  [x: string]: {
    typeDef: TypeDefinitionField;
    query?: JomqlQuery;
    typename: string;
    nested?: JomqlResolverNode;
  };
};

export type JomqlQuery = {
  [y: string]: any;
  __args?: JomqlQueryArgs;
};

export type JomqlQueryArgs = {
  [x: string]: JomqlQueryArgs | undefined;
};

export type JomqlResultsNode = null | {
  [x: string]: JomqlResultsNode | any;
};
