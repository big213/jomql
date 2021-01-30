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
  JsType,
  ResolverFunction,
  RootResolverFunction,
  JomqlQuery,
  JomqlQueryArgs,
  ObjectTypeDefinitionField,
  isRootResolverDefinition,
} from "./types";

let exportedLookupValue: any,
  exportedDebug: boolean,
  exportedCustomProcessor: boolean;

// set a symbol for lookups
export const lookupSymbol = Symbol("lookup");

export const objectTypeDefs: Map<string, JomqlObjectType> = new Map();
export const inputTypeDefs: Map<string, JomqlInputType> = new Map();
export const scalarTypeDefs: Map<string, JomqlScalarType> = new Map();

export const rootResolvers: Map<string, JomqlRootResolverType> = new Map();

export function initializeJomql(app: Express, params: Params) {
  const {
    debug = false,
    lookupValue = null,
    jomqlPath = "/jomql",
    customProcessor = false,
  } = params;

  // jomqlPath must start with '/'
  if (!jomqlPath.match(/^\//)) {
    throw new JomqlInitializationError({
      message: `Invalid jomql path`,
    });
  }

  exportedCustomProcessor = customProcessor;

  //lookup value must be primitive. i.e. null, true, false, 1
  exportedLookupValue = lookupValue;

  exportedDebug = debug;

  app.post(jomqlPath, createJomqlRequestHandler());

  // populate all RESTful routes. This should only be done on cold starts.
  rootResolvers.forEach((item, key) => {
    if (item.definition.route === jomqlPath)
      throw new JomqlInitializationError({
        message: `Duplicate route for jomql path: '${jomqlPath}'`,
      });

    app[item.definition.method](
      item.definition.route,
      createRestRequestHandler(item.definition, key)
    );
  });

  app.set("json replacer", function (key: string, value: any) {
    // undefined values are set to `null`
    if (typeof value === "undefined") {
      return null;
    }
    return value;
  });
}

export const getLookupValue = () => exportedLookupValue;

export const getCustomProcessor = () => exportedCustomProcessor;

export const isDebug = () => exportedDebug;

export * as BaseScalars from "./scalars";

export {
  generateJomqlResolverTree,
  processJomqlResolverTree,
  validateExternalArgs,
  validateResultFields,
  generateAnonymousRootResolver,
} from "./helpers/jomql";
