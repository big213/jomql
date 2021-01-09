import { string } from "../scalars";

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
  readonly debug?: Boolean;
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

export type ResolverObject = {
  type: string | ScalarDefinition;
  isArray?: boolean;
  allowNull: boolean;
  args?: ArgDefinition;
  resolver?: ResolverFunction;
};

export type RootResolverObject = ResolverObject & {
  method: ValidMethod;
  route: string;
  resolver: ResolverFunction;
};

export type RootResolverType = "query" | "mutation" | "subscription";

export type RootResolver = {
  [y in RootResolverType]: {
    [x: string]: RootResolverObject;
  };
};

export type TypeDefinitionField = ResolverObject & {
  customOptions?: {
    [x: string]: any;
  };
  required?: boolean;
  hidden?: boolean;
  dataloader?: any;
  deleter?: Function;
  setter?: Function;
  updater?: Function;
};

export type TypeDefinition = {
  [x: string]: TypeDefinitionField;
};

export type JsType = "string" | "number" | "boolean" | "unknown";

export type Schema = {
  rootResolvers: RootResolver;
  typeDefs: Map<string, TypeDefinition>;
  inputDefs: Map<string, InputTypeDefinition>;
  scalars: {
    [x: string]: ScalarDefinition;
  };
};

export type ScalarDefinition = {
  name: string;
  types: string[];
  serialize?: ScalarDefinitionFunction;
  parseValue?: ScalarDefinitionFunction;
};

export type ScalarDefinitionFunction = (
  value: unknown,
  fieldPath: string[]
) => any;

export type ResolverFunction = (
  req: any,
  args: any,
  query?: any,
  typename?: string,
  currentObject?: any,
  fieldPath?: string[]
) => any;

export type JomqlResolverObject = {
  [x: string]: {
    typeDef: TypeDefinitionField;
    query?: JomqlQuery;
    typename: string;
    nested?: JomqlResolverObject;
  };
};

export type JomqlQuery = {
  [y: string]: any;
  __args?: JomqlQueryArgs;
};

export type JomqlQueryArgs = null | {
  [x: string]: any;
};

export type JomqlOutput = null | {
  [x: string]: any;
};
