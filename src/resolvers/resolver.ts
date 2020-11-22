import * as jomqlHelper from "../helpers/tier0/jomql";
import sharedHelper from "../helpers/tier0/shared";

import { mysqlHelper, getTypeDefs } from "..";

//validates the add fields, and then does the add operation
export async function addTableRow(
  classname,
  args,
  adminFields = {},
  ignore = false
) {
  //resolve the setters
  const validQuery = getTypeDefs()[classname];

  //assemble the mysql fields
  const mysqlFields = {};

  //handle the custom setters
  const customResolvers = {};

  for (const field in args) {
    if (field in validQuery) {
      if (validQuery[field].addable) {
        //if there's a setter to transform the input, use that
        mysqlFields[field] = validQuery[field].transform?.setter
          ? await validQuery[field].transform?.setter(args[field])
          : args[field];
      } else if (validQuery[field].setter) {
        customResolvers[field] = validQuery[field].setter;
      }
    }
  }

  //process adminFields
  for (const field in adminFields) {
    if (field in validQuery) {
      if (validQuery[field].setter) {
        customResolvers[field] = validQuery[field].setter;
      } else {
        mysqlFields[field] = validQuery[field].transform?.setter
          ? await validQuery[field].transform?.setter(adminFields[field])
          : adminFields[field];
      }
    }
  }

  //do the mysql first
  const addResults = await mysqlHelper.insertTableRow(
    classname,
    mysqlFields,
    ignore
  );

  const resultObject = {
    id: addResults.insertId,
  };

  //handle the custom setter functions, which might rely on primary keys
  for (const field in customResolvers) {
    await customResolvers[field](classname, args[field], resultObject);
  }

  return resultObject;
}

//validates the add fields, and then does the add operation
export async function updateTableRow(classname, args, whereArray) {
  //resolve the setters
  const validQuery = getTypeDefs()[classname];

  //assemble the mysql fields
  const mysqlFields = {};

  //handle the custom setters
  const customResolvers = {};

  for (const field in args) {
    if (field in validQuery) {
      if (validQuery[field].updateable) {
        //if there's a setter to transform the input, use that
        mysqlFields[field] = validQuery[field].transform?.setter
          ? await validQuery[field].transform?.setter(args[field])
          : args[field];
      } else if (validQuery[field].updater) {
        customResolvers[field] = validQuery[field].updater;
      }
    }
  }

  //do the mysql first
  await mysqlHelper.updateTableRow(classname, mysqlFields, {}, whereArray);

  const resultObject = {
    id: args.id,
  };

  //handle the custom setter functions, which might rely on primary keys
  for (const field in customResolvers) {
    await customResolvers[field](classname, args[field], resultObject);
  }

  return resultObject;
}

//performs the delete operation
export async function deleteTableRow(classname, args, whereArray) {
  //resolve the deleters
  const validQuery = getTypeDefs()[classname];

  //handle the custom deleters
  const customResolvers = {};

  for (const field in validQuery) {
    if (validQuery[field].deleter) {
      customResolvers[field] = validQuery[field].deleter;
    }
  }

  //do the mysql first
  await mysqlHelper.removeTableRow(classname, whereArray);

  const resultObject = {
    id: args.id,
  };

  //handle the custom deleter functions, which might rely on primary keys
  for (const field in customResolvers) {
    await customResolvers[field](classname, null, resultObject);
  }

  return resultObject;
}

export async function resolveTableRows(
  typename,
  context,
  req,
  jomqlQuery,
  args = {},
  typeDef?: any
) {
  //validate graphql
  const validatedGraphql = jomqlHelper.validateJsonqlQuery(
    jomqlQuery.select,
    typename,
    typeDef
  );

  const validQuery = getTypeDefs()[typename];

  jomqlQuery.select = validatedGraphql.validatedQuery;

  let hasMysqlFields = false;
  //handle mysql fields - if any
  for (const prop in jomqlQuery.select) {
    if (!jomqlQuery.select[prop].resolver) {
      hasMysqlFields = true;
      break;
    }
  }

  //validate where fields and remove any that are not filterable
  if (Array.isArray(jomqlQuery.where)) {
    jomqlQuery.where.forEach((ele) => {
      for (const field in ele) {
        if (field in validQuery) {
          if (!validQuery[field].filterable) {
            delete ele[field];
          }
        }
      }
    });
  }

  const returnArray = hasMysqlFields
    ? sharedHelper.collapseObjectArray(
        await mysqlHelper.fetchTableRows(typename, jomqlQuery)
      )
    : [{ __typename: typename }];

  //apply transformations of results
  for (const returnObject of returnArray) {
    await jomqlHelper.handleTransformQueries(
      returnObject,
      validatedGraphql.validatedQuery,
      typename,
      req,
      args
    );
  }

  //handle resolved fields
  for (const returnObject of returnArray) {
    await jomqlHelper.handleResolvedQueries(
      returnObject,
      validatedGraphql.validatedResolvedQuery,
      typename,
      req,
      args
    );
  }

  //handle aggregated fields
  await jomqlHelper.handleAggregatedQueries(
    returnArray,
    validatedGraphql.validatedAggregatedQuery,
    typename,
    req,
    args
  );

  return returnArray;
}

export async function countTableRows(classname, filterArray) {
  const validQuery = getTypeDefs()[classname];

  //validate where fields and remove any that are not filterable
  if (Array.isArray(filterArray)) {
    filterArray.forEach((ele) => {
      for (const field in ele) {
        if (field in validQuery) {
          if (!validQuery[field].filterable) {
            delete ele[field];
          }
        }
      }
    });
  }
  return mysqlHelper.countTableRows(classname, filterArray);
}
