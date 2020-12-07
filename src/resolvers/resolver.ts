import {
  generateJomqlResolverTree,
  handleResolvedQueries,
  handleAggregatedQueries,
} from "../helpers/tier0/jomql";
import { collapseObjectArray } from "../helpers/tier0/shared";
import type { TypeDef, SqlParams, SqlWhereObject, JomqlOutput } from "../types";

import { mysqlHelper, getTypeDefs } from "..";

export type CustomResolver = {
  resolver: Function;
  value?: any;
};

export type CustomResolverMap = {
  [x: string]: CustomResolver;
};

//validates the add fields, and then does the add operation
export async function addTableRow(
  typename: string,
  req,
  args,
  adminFields = {},
  ignore = false
) {
  const typeDef: TypeDef = getTypeDefs()[typename];

  // assemble the mysql fields
  const sqlFields = {};

  // handle the custom setters
  const customResolvers: CustomResolverMap = {};

  for (const field in args) {
    if (field in typeDef) {
      // skip if not addable
      if (!typeDef[field].addable) {
        continue;
      }

      // transform the input if there is a transform setter
      const transformSetter = typeDef[field].transform?.setter;
      const value = transformSetter
        ? await transformSetter(args[field])
        : args[field];

      // if it is a mysql field, add to mysqlFields
      if (typeDef[field].mysqlOptions) {
        sqlFields[field] = value;
      }

      // if it has a custom setter, add to customResolvers
      const customSetter = typeDef[field].setter;
      if (customSetter) {
        customResolvers[field] = {
          resolver: customSetter,
          value,
        };
      }
    }
  }

  // process adminFields -- will not check for addable for these
  for (const field in adminFields) {
    if (field in typeDef) {
      // transform the input if there is a transform setter
      const transformSetter = typeDef[field].transform?.setter;
      const value = transformSetter
        ? await transformSetter(adminFields[field])
        : adminFields[field];

      // if it is a mysql field, add to mysqlFields
      if (typeDef[field].mysqlOptions) {
        sqlFields[field] = value;
      }

      // if it has a custom setter, add to customResolvers
      const customSetter = typeDef[field].setter;
      if (customSetter) {
        customResolvers[field] = {
          resolver: customSetter,
          value,
        };
      }
    }
  }

  let addedResults;

  //do the mysql first, if any
  if (Object.keys(sqlFields).length > 0) {
    addedResults = await mysqlHelper.insertTableRow(
      typename,
      sqlFields,
      ignore
    );
  }

  const resultObject = {
    id: addedResults.insertId,
  };

  // handle the custom setter functions, which might rely on id of created object
  for (const field in customResolvers) {
    await customResolvers[field].resolver(
      typename,
      req,
      customResolvers[field].value,
      resultObject
    );
  }

  return resultObject;
}

// validates the update fields, and then does the update operation
export async function updateTableRow(
  typename: string,
  req,
  args,
  whereArray: SqlWhereObject[]
) {
  //resolve the setters
  const typeDef: TypeDef = getTypeDefs()[typename];

  //assemble the mysql fields
  const sqlFields = {};

  //handle the custom setters
  const customResolvers: CustomResolverMap = {};

  for (const field in args) {
    if (field in typeDef) {
      if (typeDef[field].updateable) {
        // transform the input if there is a transform setter
        const transformSetter = typeDef[field].transform?.setter;
        const value = transformSetter
          ? await transformSetter(args[field])
          : args[field];

        // if it is a mysql field, add to mysqlFields
        if (typeDef[field].mysqlOptions) {
          sqlFields[field] = value;
        }

        // if it has a custom updater, add to customResolvers
        const customResolver = typeDef[field].updater;
        if (customResolver) {
          customResolvers[field] = {
            resolver: customResolver,
            value,
          };
        }
      }
    }
  }

  // do the mysql first, if any fields
  if (Object.keys(sqlFields).length > 0) {
    await mysqlHelper.updateTableRow(typename, sqlFields, {}, whereArray);
  }

  const resultObject = {
    id: args.id,
  };

  //handle the custom setter functions, which might rely on primary keys
  for (const field in customResolvers) {
    await customResolvers[field].resolver(
      typename,
      req,
      customResolvers[field].value,
      resultObject
    );
  }

  return resultObject;
}

// performs the delete operation
export async function deleteTableRow(
  typename: string,
  req,
  args,
  whereArray: SqlWhereObject[]
) {
  //resolve the deleters
  const typeDef: TypeDef = getTypeDefs()[typename];

  //handle the custom deleters
  const customResolvers: CustomResolverMap = {};

  for (const field in typeDef) {
    // if it has a custom deleter, add to customResolvers
    const customResolver = typeDef[field].deleter;
    if (customResolver) {
      customResolvers[field] = {
        resolver: customResolver,
      };
    }
  }

  // do the mysql first
  await mysqlHelper.removeTableRow(typename, whereArray);

  const resultObject = {
    id: args.id,
  };

  //handle the custom deleter functions, which might rely on primary keys
  for (const field in customResolvers) {
    await customResolvers[field].resolver(typename, req, null, resultObject);
  }

  return resultObject;
}

export async function resolveTableRows(
  typename: string,
  req,
  externalQuery: { [x: string]: any },
  sqlParams: SqlParams,
  args = {},
  externalTypeDef?: TypeDef
) {
  // shortcut: if no fields were requested, simply return typename
  if (Object.keys(externalQuery).length < 1) return [{ __typename: typename }];

  // convert externalQuery into a resolver tree
  const {
    validatedSqlQuery,
    validatedResolverQuery,
  } = generateJomqlResolverTree(
    externalQuery,
    externalTypeDef ?? getTypeDefs()[typename]
  );

  const sqlQuery = {
    select: validatedSqlQuery,
    from: typename,
    ...sqlParams,
  };

  // validation of whereArray must happen in the application logic

  const returnArray: JomqlOutput[] =
    validatedSqlQuery.length > 0
      ? collapseObjectArray(await mysqlHelper.fetchTableRows(sqlQuery))
      : [{}];

  // handle resolved fields
  for (const returnObject of returnArray) {
    await handleResolvedQueries(
      returnObject,
      validatedResolverQuery,
      typename,
      req,
      args
    );
  }

  // handle aggregated fields
  await handleAggregatedQueries(
    returnArray,
    validatedResolverQuery,
    typename,
    req,
    args
  );

  return returnArray;
}

export function countTableRows(typename: string, whereArray: SqlWhereObject[]) {
  // validation of whereArray must happen in the application logic
  return mysqlHelper.countTableRows(typename, whereArray);
}
