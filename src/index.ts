import routerHelper from "./helpers/tier1/router";
import { generateSchema, generateGraphqlSchema } from './helpers/tier0/schema';
import { handleWebhook, handlePusherAuth, typeDef as jqlSubscriptionTypeDef } from "./helpers/tier2/subscription";
import { initializePusher } from './utils/pusher';
import type { Params } from "./types";

// utils
import * as mysql from './utils/mysql2';

let exportedSchema: any, exportedLookupValue: any, exportedDebug: boolean;

export function initialize(app: any, schema: any, params: Params) {
  const {
    mysqlEnv,
    pusherEnv,
    debug,
    allowedOrigins,
    lookupValue = null,
    jomqlPath = '/jomql'
  } = params;

  // jomqlPath must start with '/'

  if (!jomqlPath.match(/^\//)) {
    throw new Error('Invalid jomqlPath');
  }

  exportedSchema = schema;

  //lookup value must be primitive. i.e. null, true, false, 1
  exportedLookupValue = lookupValue;

  exportedDebug = !!debug;
  
  mysql.initializePool(mysqlEnv, debug);

  pusherEnv && initializePusher(pusherEnv);

  app.use((req: any, res: any, next: any) => {
    // aggregate all root resolvers
    const allRootResolvers = {};

    for(const resolverType in schema.rootResolvers) {
      for(const prop in schema.rootResolvers[resolverType]) {
        allRootResolvers[prop] = schema.rootResolvers[resolverType][prop];
      }
    }

    // handle jql queries
    if(req.method === "POST" && req.url === jomqlPath) {
      if(req.body.action in allRootResolvers) {
        // map from action to method + url
        req.method = allRootResolvers[req.body.action].method;
        req.url = allRootResolvers[req.body.action].route;

        //add the app route that we are going to use
        app[allRootResolvers[req.body.action].method](allRootResolvers[req.body.action].route, routerHelper.externalFnWrapper(allRootResolvers[req.body.action].resolver)); 
      }

      req.jql = req.body.query || {};
    } else {
      //if not using jql, must populate all the routes
      for(const prop in allRootResolvers) {
        app[allRootResolvers[prop].method](allRootResolvers[prop].route, routerHelper.externalFnWrapper(allRootResolvers[prop].resolver));
      }
    }
    next();
  });
  
  app.set('json replacer', function (key, value) {
    // undefined values are set to `null`
    if (typeof value === "undefined") {
      return null;
    }
    return value;
  });
  
  app.use(function(req, res, next) {
    const origin = (Array.isArray(allowedOrigins) && allowedOrigins.length) ? (allowedOrigins.includes(req.headers.origin) ? req.headers.origin : allowedOrigins[0]) : "*";

    res.header("Access-Control-Allow-Origin", origin);
    if(origin !== "*") {
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control");
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
    next();
  });
  
  app.options('*', function(req, res, next){
    res.header('Access-Control-Max-Age', "86400");
    res.sendStatus(200);
  });

  app.get("/schema", function(req, res) {
    res.send(generateSchema(schema));
  });

  app.get("/graphqlschema", function(req, res) {
    res.send(generateGraphqlSchema(schema));
  });

  app.post('/pusher/auth', handlePusherAuth);

  app.post('/pusher/webhook', handleWebhook);

  app.post('/mysql/sync', function(req, res) {
    //loop through typeDefs to identify needed mysql tables
    mysql.initializeSequelize(mysqlEnv);
    const sequelize = mysql.getSequelizeInstance();
  
    for(const type in schema.typeDefs) {
      const definition = {};
      let properties = 0;
      for(const prop in schema.typeDefs[type]) {
        if(prop !== 'id' && schema.typeDefs[type][prop].mysqlOptions?.type) {
          definition[prop] = schema.typeDefs[type][prop].mysqlOptions;
          properties++;
        }
      }
      if(properties > 0) {
        sequelize.define(type, definition, { timestamps: false, freezeTableName: true });
      }
    }
  
    //define the jql subscription table
    sequelize.define('jqlSubscription', jqlSubscriptionTypeDef, { timestamps: false, freezeTableName: true });

    sequelize.sync({ alter: true }).then(() => {
      console.log("Drop and re-sync db.");
      sequelize.close();
      res.send({});
    });
  });
};

export const getSchema = () => exportedSchema;

export const getLookupValue = () => exportedLookupValue;

export const getTypeDefs = () => exportedSchema.typeDefs;

export const isDebug = () => exportedDebug;

export * as subscriptionHelper from './helpers/tier2/subscription';

export * as mysqlHelper from './helpers/tier1/mysql';

export * as resolverHelper from './resolvers/resolver';
export { dataTypes } from './helpers/tier0/dataType';

export * as jomqlHelper from './helpers/tier0/jql';

export { ErrorWrapper } from './classes/errorWrapper';