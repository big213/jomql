import { getLookupValue, getTypeDefs } from "../../index";
import type {
  TypeDef,
  JomqlResolverTree,
  SqlQuerySelectObject,
  JomqlResolverObject,
  JomqlQuery,
  JomqlOutput,
} from "../../types";

export function generateJomqlResolverTree(
  externalQuery: JomqlQuery,
  typeDef?: TypeDef,
  parentFields: string[] = []
): JomqlResolverTree {
  if (!typeDef) throw new Error("Invalid typeDef");

  const validatedSqlQuery: SqlQuerySelectObject[] = [];
  const validatedResolverQuery: JomqlResolverObject = {};

  //define the lookupValue
  const lookupValue = getLookupValue();

  //ensure the id field is there, if it is part of the typeDef
  if ("id" in typeDef && !("id" in externalQuery)) {
    externalQuery.id = lookupValue;
  }

  //if the * field is provided, make sure all non-arg, non-hidden fields are there
  if ("*" in externalQuery && externalQuery["*"] === lookupValue) {
    for (const field in typeDef) {
      if (
        !typeDef[field].hidden &&
        !typeDef[field].args &&
        !(field in externalQuery)
      ) {
        externalQuery[field] = lookupValue;
      }
    }
    delete externalQuery["*"];
  }

  for (const field in externalQuery) {
    // skip __args, even though it should already be parsed out
    if (field === "__args") {
      continue;
    }

    if (!(field in typeDef))
      throw new Error("Invalid Query: Unknown field '" + field + "'");

    // deny hidden fields
    if (typeDef[field].hidden) {
      throw new Error("Invalid Query: Hidden field '" + field + "'");
    }

    // deny fields with no type
    if (!typeDef[field].type) {
      throw new Error("Invalid Query: Mis-configured field '" + field + "'");
    }

    // we will keep track of if the field was used for anything
    let fieldUsed = false;

    // check if field is lookupValue
    const isLookupField = externalQuery[field] === lookupValue;

    // check if field is nested
    const isNestedField =
      externalQuery[field] && typeof externalQuery[field] === "object";

    // if not lookup or nested, deny
    if (!isLookupField && !isNestedField)
      throw new Error("Invalid Query: Invalid field RHS '" + field + "'");

    validatedResolverQuery[field] = {
      type: typeDef[field].type,
    };

    // add the transform getter to the resolver tree
    if (typeDef[field].transform?.getter) {
      fieldUsed = true;
      validatedResolverQuery[field].getter = typeDef[field].transform?.getter;
    }

    // if dataloader field present, add to resolver tree if nested (not a direct value lookup)
    if (typeDef[field].dataloader && isNestedField) {
      fieldUsed = true;
      validatedResolverQuery[field].dataloader = typeDef[field].dataloader;
      validatedResolverQuery[field].query = externalQuery[field];
    }

    // add custom resolvers to the resolver tree if nested field or not mysql field
    if (
      (typeDef[field].resolver && isNestedField) ||
      !typeDef[field].mysqlOptions
    ) {
      fieldUsed = true;

      validatedResolverQuery[field].resolver = typeDef[field].resolver;
      validatedResolverQuery[field].query = externalQuery[field];
    }

    // has mysqlOptions, is a mysql field
    const mysqlOptions = typeDef[field].mysqlOptions;
    if (mysqlOptions) {
      fieldUsed = true;
      const joinType = mysqlOptions.joinInfo?.type;

      // check if field is hidden when part of a nested query
      if (parentFields.length && mysqlOptions.joinHidden) {
        throw new Error(
          "Invalid Query: Requested field not allowed to be accessed directly in an nested context: '" +
            field +
            "'"
        );
      }

      // lookup the raw value directly
      if (
        isLookupField ||
        validatedResolverQuery[field].dataloader ||
        validatedResolverQuery[field].resolver
      )
        validatedSqlQuery.push({
          field: parentFields.concat(field).join("."),
        });
      else if (joinType && isNestedField) {
        // need to join with another field
        const validatedNestedFields = generateJomqlResolverTree(
          externalQuery[field],
          getTypeDefs().get(joinType),
          parentFields.concat(field)
        );

        validatedSqlQuery.push(...validatedNestedFields.validatedSqlQuery);

        validatedResolverQuery[field].nested =
          validatedNestedFields.validatedResolverQuery;
      } else {
        throw new Error("Invalid Query: Mis-configured field '" + field + "'");
      }
    }

    // if field did not appear in resolver or sql, the query is invalid
    if (!fieldUsed) {
      throw new Error("Invalid Query: Mis-configured field '" + field + "'");
    }
  }

  return {
    validatedSqlQuery,
    validatedResolverQuery,
  };
}

// resolves the queries, and attaches them to the obj (if possible)
export async function handleResolvedQueries(
  obj: JomqlOutput,
  resolverQuery: JomqlResolverObject,
  typename: string,
  req,
  args,
  previous?: Object
) {
  // add the typename field if the obj is an object and there is a corresponding type
  if (typename && obj && typeof obj === "object") {
    obj.__typename = typename;
  }

  for (const field in resolverQuery) {
    // if field has a resolver, attempt to resolve and put in obj
    const resolverFn = resolverQuery[field].resolver;
    if (resolverFn) {
      obj[field] = await resolverFn(
        req,
        args,
        resolverQuery[field].query,
        resolverQuery[field].type,
        obj,
        previous
      );
    } else {
      // if field does not have a resolver, it must be part of the tree. go deeper
      const nestedResolver = resolverQuery[field].nested;
      if (nestedResolver)
        await handleResolvedQueries(
          obj[field],
          nestedResolver,
          resolverQuery[field].type,
          req,
          args,
          {
            obj, //parent obj
            resolverQuery,
          }
        );
    }

    // if resolver has a getter, apply it to the end result
    const getter = resolverQuery[field].getter;
    if (getter) {
      obj[field] = await getter(obj[field]);
    }
  }
}

export async function handleAggregatedQueries(
  resultsArray: JomqlOutput[],
  resolverQuery: JomqlResolverObject,
  typename: string,
  req,
  args,
  previous?: Object
) {
  for (const field in resolverQuery) {
    const dataloaderFn = resolverQuery[field].dataloader;
    if (dataloaderFn) {
      const keySet = new Set();

      // aggregate ids
      resultsArray.forEach((result) => {
        keySet.add(result[field]);
      });

      // lookup all the ids
      const aggregatedResults = await dataloaderFn(
        req,
        { id: [...keySet] },
        resolverQuery[field].query,
        typename,
        {},
        previous
      );

      // build id -> record map
      const recordMap = new Map();
      aggregatedResults.forEach((result) => {
        recordMap.set(result.id, result);
      });

      // join the records in memory
      resultsArray.forEach((result) => {
        result[field] = recordMap.get(result[field]);
      });
    } else {
      // if field does not have a dataloader, it must be nested.
      const nestedResolver = resolverQuery[field].nested;
      if (nestedResolver) {
        // build the array of records that will need replacing
        const nestedResultsArray = resultsArray.map((result) => result[field]);

        await handleAggregatedQueries(
          nestedResultsArray,
          nestedResolver,
          resolverQuery[field].type,
          req,
          args
        );
      }
    }
  }
}
