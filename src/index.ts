import { externalFnWrapper } from "./helpers/tier1/router";
import { generateSchema, generateGraphqlSchema } from "./helpers/tier0/schema";
import type { Params, Schema } from "./types";
export type {
  RootResolver,
  RootResolverObject,
  Schema,
  ResolverFunction,
  TypeDefObject,
  TypeDef,
  SqlJoinFieldObject,
  SqlWhereObject,
  SqlQuerySelectObject,
  SqlSortFieldObject,
} from "./types";
// utils
import * as mysql from "./utils/mysql2";

import { initializeSequelize, getSequelizeInstance } from "./utils/sequelize";

let exportedSchema: Schema, exportedLookupValue: any, exportedDebug: boolean;

export function initializeJomql(app: any, schema: Schema, params: Params) {
  const {
    mysqlEnv,
    debug,
    allowedOrigins,
    lookupValue = null,
    jomqlPath = "/jomql",
    allowSync = false,
  } = params;

  // jomqlPath must start with '/'
  if (!jomqlPath.match(/^\//)) {
    throw new Error("Invalid jomqlPath");
  }

  exportedSchema = schema;

  //lookup value must be primitive. i.e. null, true, false, 1
  exportedLookupValue = lookupValue;

  exportedDebug = !!debug;

  mysql.initializePool(mysqlEnv, debug);

  app.use((req: any, res, next) => {
    // aggregate all root resolvers
    const allRootResolversMap = new Map();

    for (const resolverType in schema.rootResolvers) {
      for (const prop in schema.rootResolvers[resolverType]) {
        allRootResolversMap.set(prop, schema.rootResolvers[resolverType][prop]);
      }
    }

    // handle jomql queries
    if (req.method === "POST" && req.url === jomqlPath) {
      const rootResolverObject = allRootResolversMap.get(req.body.action);

      if (rootResolverObject) {
        // map from action to method + url
        req.method = rootResolverObject.method;
        req.url = rootResolverObject.route;

        //add only the app route that we are going to use
        app[rootResolverObject.method](
          rootResolverObject.route,
          externalFnWrapper(rootResolverObject.resolver)
        );
      }

      req.jomql = req.body.query || {};
    } else {
      //if not using jomql, must populate all the routes
      allRootResolversMap.forEach((item) => {
        app[item.method](item.route, externalFnWrapper(item.resolver));
      });
    }
    next();
  });

  app.set("json replacer", function (key, value) {
    // undefined values are set to `null`
    if (typeof value === "undefined") {
      return null;
    }
    return value;
  });

  app.use(function (req, res, next) {
    const origin =
      Array.isArray(allowedOrigins) && allowedOrigins.length
        ? allowedOrigins.includes(req.headers.origin)
          ? req.headers.origin
          : allowedOrigins[0]
        : "*";

    res.header("Access-Control-Allow-Origin", origin);
    if (origin !== "*") {
      res.header("Vary", "Origin");
    }
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "PUT, POST, GET, DELETE, OPTIONS"
    );
    next();
  });

  app.options("*", function (req, res, next) {
    res.header("Access-Control-Max-Age", "86400");
    res.sendStatus(200);
  });

  app.get("/schema", function (req, res) {
    res.send(generateSchema(schema));
  });

  app.get("/graphqlschema", function (req, res) {
    res.send(generateGraphqlSchema(schema));
  });

  app.post(
    "/mysql/sync",
    externalFnWrapper((req, res) => {
      // only allowed to call on dev mode
      if (!allowSync) {
        throw new Error("Sync disabled");
      }
      return syncDatabase(mysqlEnv, schema);
    })
  );
}

export { initializeSequelize, getSequelizeInstance } from "./utils/sequelize";

export const getSchema = () => exportedSchema;

export const getLookupValue = () => exportedLookupValue;

export const getTypeDefs = () => exportedSchema.typeDefs;

export const isDebug = () => exportedDebug;

export * as mysqlHelper from "./helpers/tier1/mysql";

export * as resolverHelper from "./resolvers/resolver";
export { dataTypes } from "./helpers/tier0/dataType";

export { DataTypes as sequelizeDataTypes, Sequelize } from "sequelize";

export * as jomqlHelper from "./helpers/tier0/jomql";

export { ErrorWrapper } from "./classes/errorWrapper";

export function syncDatabase(mysqlEnv, schema) {
  //loop through typeDefs to identify needed mysql tables
  initializeSequelize(mysqlEnv);
  const sequelize = getSequelizeInstance();

  for (const type in schema.typeDefs) {
    const definition = {};
    let properties = 0;
    for (const prop in schema.typeDefs[type]) {
      if (prop !== "id" && schema.typeDefs[type][prop].mysqlOptions?.type) {
        definition[prop] = schema.typeDefs[type][prop].mysqlOptions;
        properties++;
      }
    }
    if (properties > 0) {
      sequelize.define(type, definition, {
        timestamps: false,
        freezeTableName: true,
      });
    }
  }

  return sequelize
    .sync({ alter: true })
    .then(() => {
      console.log("Done syncing DB");
      sequelize.close();
    })
    .catch((err) => {
      console.log("An error occurred with syncing.");
      console.log(err);
      sequelize.close();
    });
}
