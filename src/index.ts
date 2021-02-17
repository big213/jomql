import type { Express } from "express";
import {
  createJomqlRequestHandler,
  createRestRequestHandler,
} from "./helpers/router";

import {
  JomqlInitializationError,
  JomqlObjectType,
  JomqlRootResolverType,
  JomqlInputType,
  JomqlScalarType,
} from "./classes";

import type { Params } from "./types";

export { TsSchemaGenerator } from "./classes/schema";

export {
  JomqlArgsError,
  JomqlBaseError,
  JomqlQueryError,
  JomqlResultError,
  JomqlInitializationError,
  JomqlObjectType,
  JomqlInputType,
  JomqlRootResolverType,
  JomqlScalarType,
  JomqlInputTypeLookup,
  JomqlObjectTypeLookup,
  JomqlInputFieldType,
} from "./classes";

export {
  RootResolverDefinition,
  ObjectTypeDefinition,
  InputFieldDefinition,
  InputTypeDefinition,
  ScalarDefinition,
  JomqlResolverNode,
  ResolverFunction,
  RootResolverFunction,
  ObjectTypeDefinitionField,
  ArrayOptions,
  isRootResolverDefinition,
  StringKeyObject,
} from "./types";

let exportedParams: Required<Params>;

// set a symbol for lookups
export const lookupSymbol = Symbol("lookup");

export const objectTypeDefs: Map<string, JomqlObjectType> = new Map();
export const inputTypeDefs: Map<string, JomqlInputType> = new Map();
export const scalarTypeDefs: Map<string, JomqlScalarType> = new Map();

export const rootResolvers: Map<string, JomqlRootResolverType> = new Map();

export function initializeJomql(
  app: Express,
  {
    debug = false,
    lookupValue = true,
    jomqlPath = "/jomql",
    processEntireTree = true,
  }: Params = {}
): void {
  // jomqlPath must start with '/'
  if (!jomqlPath.match(/^\//)) {
    throw new JomqlInitializationError({
      message: `Invalid jomql path`,
    });
  }

  exportedParams = {
    debug,
    lookupValue,
    jomqlPath,
    processEntireTree,
  };

  app.post(jomqlPath, createJomqlRequestHandler());

  // populate all RESTful routes. This should only be done on cold starts.
  rootResolvers.forEach((item, key) => {
    const restOptions = item.definition.restOptions;
    if (!restOptions) return;

    if (restOptions.route === jomqlPath)
      throw new JomqlInitializationError({
        message: `Duplicate route for jomql path: '${jomqlPath}'`,
      });

    app[restOptions.method](
      restOptions.route,
      createRestRequestHandler(item.definition, key)
    );
  });

  app.set("json replacer", function (key: string, value: unknown) {
    // undefined values are set to `null`
    if (typeof value === "undefined") {
      return null;
    }
    return value;
  });
}

export function getParams(): Params {
  if (!exportedParams) {
    throw new JomqlInitializationError({
      message: `Jomql has not been initialized yet`,
    });
  }
  return exportedParams;
}

export * as BaseScalars from "./scalars";

export {
  generateJomqlResolverTree,
  processJomqlResolverTree,
  validateExternalArgs,
  validateResultFields,
  generateAnonymousRootResolver,
} from "./helpers/jomql";
