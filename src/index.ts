import { Express } from "express";
import {
  createJomqlRequestHandler,
  createRestRequestHandler,
} from "./helpers/router";
import { generateTsSchema } from "./helpers/schema";
import type { Params, Schema, RootResolverObject } from "./types";
export {
  RootResolver,
  RootResolverObject,
  Schema,
  ResolverFunction,
  TypeDefinitionField,
  TypeDefinition,
  ArgDefinition,
  ScalarDefinition,
  JomqlResolverObject,
  isScalarDefinition,
  JsType,
} from "./types";
export { JomqlFieldError } from "./classes";

let exportedSchema: Schema, exportedLookupValue: any, exportedDebug: boolean;

export function initializeJomql(app: Express, params: Params) {
  const { schema, debug, lookupValue = null, jomqlPath = "/jomql" } = params;

  // jomqlPath must start with '/'
  if (!jomqlPath.match(/^\//)) {
    throw new Error("Invalid jomqlPath");
  }

  exportedSchema = schema;

  //lookup value must be primitive. i.e. null, true, false, 1
  exportedLookupValue = lookupValue;

  exportedDebug = !!debug;

  // aggregate all root resolvers
  const allRootResolversMap: Map<string, RootResolverObject> = new Map();

  Object.values(schema.rootResolvers).forEach((rootResolver) => {
    for (const key in rootResolver) {
      allRootResolversMap.set(key, rootResolver[key]);
    }
  });

  app.post(jomqlPath, createJomqlRequestHandler(allRootResolversMap));

  // populate all RESTful routes. This should only be done on cold starts.
  allRootResolversMap.forEach((item, key) => {
    if (item.route === jomqlPath)
      throw new Error(`Duplicate route for jomql path: '${jomqlPath}'`);

    app[item.method](item.route, createRestRequestHandler(item, key));
  });

  app.set("json replacer", function (key: string, value: any) {
    // undefined values are set to `null`
    if (typeof value === "undefined") {
      return null;
    }
    return value;
  });

  app.get("/tsschema.ts", function (req, res) {
    res.send(generateTsSchema(schema));
  });
}

export const getSchema = () => exportedSchema;

export const getLookupValue = () => exportedLookupValue;

export const getTypeDefs = () => exportedSchema.typeDefs;

export const isDebug = () => exportedDebug;

export * as BaseScalars from "./scalars";

export {
  generateJomqlResolverTree,
  processJomqlResolverTree,
  handleAggregatedQueries,
  validateExternalArgs,
  validateResultFields,
} from "./helpers/jomql";

export { generateTsSchema };

export { ErrorWrapper } from "./classes/errorWrapper";
