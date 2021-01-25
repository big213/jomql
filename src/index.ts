import type { Express } from "express";
import {
  createJomqlRequestHandler,
  createRestRequestHandler,
} from "./helpers/router";
export {
  JomqlArgsError,
  JomqlBaseError,
  JomqlQueryError,
  JomqlResultError,
  JomqlInitializationError,
} from "./classes";
export { TsSchemaGenerator } from "./classes/schema";
import { JomqlInitializationError } from "./classes";

import type { Params, Schema } from "./types";
export {
  RootResolverMap,
  RootResolverObject,
  Schema,
  TypeDefinition,
  ArgDefinition,
  InputTypeDefinition,
  ScalarDefinition,
  JomqlResolverNode,
  isScalarDefinition,
  isInputTypeDefinition,
  JsType,
  ResolverFunction,
  RootResolverFunction,
  JomqlQuery,
  JomqlQueryArgs,
  TypeDefinitionField,
} from "./types";

let exportedSchema: Schema,
  exportedLookupValue: any,
  exportedDebug: boolean,
  exportedCustomProcessor: boolean;

// set a symbol for lookups
export const lookupSymbol = Symbol("lookup");

export function initializeJomql(app: Express, params: Params) {
  const {
    schema,
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

  exportedSchema = schema;

  exportedCustomProcessor = customProcessor;

  //lookup value must be primitive. i.e. null, true, false, 1
  exportedLookupValue = lookupValue;

  exportedDebug = debug;

  app.post(jomqlPath, createJomqlRequestHandler(schema.rootResolvers));

  // populate all RESTful routes. This should only be done on cold starts.
  schema.rootResolvers.forEach((item, key) => {
    if (item.route === jomqlPath)
      throw new JomqlInitializationError({
        message: `Duplicate route for jomql path: '${jomqlPath}'`,
      });

    app[item.method](item.route, createRestRequestHandler(item, key));
  });

  app.set("json replacer", function (key: string, value: any) {
    // undefined values are set to `null`
    if (typeof value === "undefined") {
      return null;
    }
    return value;
  });
}

export const getSchema = () => exportedSchema;

export const getLookupValue = () => exportedLookupValue;

export const getCustomProcessor = () => exportedCustomProcessor;

export const getTypeDefs = () => exportedSchema.typeDefs;

export const getInputDefs = () => exportedSchema.inputDefs;

export const isDebug = () => exportedDebug;

export * as BaseScalars from "./scalars";

export {
  generateJomqlResolverTree,
  processJomqlResolverTree,
  validateExternalArgs,
  validateResultFields,
  generateAnonymousRootResolver,
} from "./helpers/jomql";
