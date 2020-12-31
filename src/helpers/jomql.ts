import { Request } from "express";
import { getLookupValue, getTypeDefs } from "..";
import {
  TypeDefinition,
  JomqlResolverObject,
  JomqlQuery,
  JomqlQueryArgs,
  JomqlOutput,
  isScalarDefinition,
  ResolverObject,
} from "../types";

export function isObject(ele: unknown) {
  return Object.prototype.toString.call(ele) === "[object Object]";
}

// validates and replaces the args in place
export function validateExternalArgs(
  args: JomqlQueryArgs | undefined,
  resolverObject: ResolverObject,
  fieldPath: string[]
) {
  const fieldString = ["root"].concat(...fieldPath).join(".");
  // if args is provided and it is not an object, throw error
  if (args && !isObject(args))
    throw new Error(`Args for field: '${fieldString}' is malformed`);

  const validArgs = resolverObject.args;
  if (!validArgs && args && Object.keys(args).length > 0) {
    throw new Error(`Not expecting any args for field: '${fieldString}'`);
  }

  if (validArgs) {
    // required arg not provided
    for (const arg in validArgs) {
      if ((!args || !(arg in args)) && validArgs[arg].required) {
        throw new Error(
          `Required arg '${arg}' not provided on field: '${fieldString}'`
        );
      }

      if (args) {
        if (
          validArgs[arg].required &&
          validArgs[arg].isArray &&
          !Array.isArray(args[arg])
        ) {
          throw new Error(
            `Expecting array for: '${arg}' on field: '${fieldString}'`
          );
        }

        if (!validArgs[arg].isArray && Array.isArray(args[arg])) {
          throw new Error(
            `Not expecting array for: '${arg}' on field: '${fieldString}'`
          );
        }
      }
    }
    for (const arg in args) {
      if (!(arg in validArgs)) {
        // unknown arg provided
        throw new Error(
          `Unknown arg '${arg}' provided for field: '${fieldString}'`
        );
      }

      // replace value if parseValue
      const parseValue = validArgs[arg].type.parseValue;
      if (parseValue) {
        // if arg is an array, loop through
        if (Array.isArray(args[arg])) {
          args[arg] = args[arg].map((ele: any) => parseValue(ele, fieldPath));
        } else {
          args[arg] = parseValue(args[arg], fieldPath);
        }
      }
    }
  }

  // if an argsValidator function is available, also run that
  if (resolverObject.argsValidator) {
    resolverObject.argsValidator(args, fieldPath);
  }
}

// throws an error if a field is not an array when it should be
export function validateResultFields(
  value: unknown,
  resolverObject: ResolverObject,
  fieldPath: string[]
) {
  const fieldString = ["root"].concat(...fieldPath).join(".");
  if (Array.isArray(value)) {
    if (resolverObject.isArray === false)
      throw new Error(`Array value not allowed for field: '${fieldString}'`);

    // check each of the array elements (NOT nesting infinitely)
    value.forEach((ele) => {
      validateResultNullish(ele, resolverObject, fieldPath);
    });
  } else {
    if (resolverObject.isArray === true)
      throw new Error(`Array value expected for field '${fieldString}'`);
    validateResultNullish(value, resolverObject, fieldPath);
  }
}

// throws an error if a field is nullish when it should not be
export function validateResultNullish(
  value: unknown,
  resolverObject: ResolverObject,
  fieldPath: string[]
) {
  if ((value === null || value === undefined) && !resolverObject.allowNull) {
    const fieldString = ["root"].concat(...fieldPath).join(".");
    throw new Error(`Null value not allowed for field: '${fieldString}'`);
  }
}

export function generateJomqlResolverTree(
  externalQuery: JomqlQuery,
  typeDef: TypeDefinition,
  parentFields: string[] = []
): JomqlResolverObject {
  if (!typeDef) throw new Error("Invalid typeDef");

  const jomqlResolverObject: JomqlResolverObject = {};

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
    // validate __args, then skip
    if (field === "__args") {
      validateExternalArgs(externalQuery.__args, typeDef[field], parentFields);
      continue;
    }

    const parentsPlusCurrentField = parentFields.concat(field);

    if (!(field in typeDef))
      throw new Error(
        `Invalid Query: Unknown field '${parentsPlusCurrentField.join(".")}'`
      );

    // deny hidden fields
    if (typeDef[field].hidden) {
      throw new Error(
        `Invalid Query: Hidden field '${parentsPlusCurrentField.join(".")}'`
      );
    }

    // deny fields with no type
    if (!typeDef[field].type) {
      throw new Error(
        `Invalid Query: Mis-configured field '${parentsPlusCurrentField.join(
          "."
        )}'`
      );
    }

    // field must either be lookupValue OR an object

    // check if field is lookupValue
    const isLookupField = externalQuery[field] === lookupValue;

    const isNestedField = isObject(externalQuery[field]);

    // field must either be lookupValue OR an object
    if (!isLookupField && !isNestedField)
      throw new Error(
        `Invalid Query: Invalid field RHS '${parentsPlusCurrentField.join(
          "."
        )}'`
      );

    const type = typeDef[field].type;

    const typename = isScalarDefinition(type) ? type.name : type;

    // if is ScalarDefinition, set type to type.name and getter to type.serialize
    jomqlResolverObject[field] = {
      typename,
      typeDef: typeDef[field],
    };

    // if nested field, set query and nested
    if (isNestedField) {
      // validate the query.__args at this point
      validateExternalArgs(
        externalQuery[field].__args,
        typeDef[field],
        [field].concat(parentFields)
      );

      jomqlResolverObject[field].query = externalQuery[field];

      // only if no resolver do we recursively add to tree
      // if there is a resolver, the sub-tree should be generated in the resolver
      if (!typeDef[field].resolver) {
        const nestedTypeDef = getTypeDefs().get(typename);

        if (!nestedTypeDef) {
          throw new Error(`TypeDef for '${typename}' not found`);
        }

        jomqlResolverObject[field].nested = generateJomqlResolverTree(
          externalQuery[field],
          nestedTypeDef,
          parentsPlusCurrentField
        );
      }
    }
  }

  return jomqlResolverObject;
}

// resolves the queries, and attaches them to the obj (if possible)
export async function processJomqlResolverTree(
  jomqlOutput: JomqlOutput,
  jomqlResolverObject: JomqlResolverObject,
  typename: string,
  req: Request,
  args: JomqlQueryArgs,
  fieldPath: string[] = []
) {
  // if output is null, cut the tree short and return
  if (jomqlOutput === null) return;

  // add the typename field if the output is an object and there is a corresponding type
  if (
    typename &&
    jomqlOutput &&
    typeof jomqlOutput === "object" &&
    !Array.isArray(jomqlOutput)
  ) {
    jomqlOutput.__typename = typename;
  }

  for (const field in jomqlResolverObject) {
    // if field has a resolver, attempt to resolve and put in obj
    const resolverFn = jomqlResolverObject[field].typeDef.resolver;

    // if query is empty, must be raw lookup field. skip
    if (resolverFn) {
      jomqlOutput[field] = await resolverFn(
        req,
        args,
        jomqlResolverObject[field].query,
        jomqlResolverObject[field].typename,
        jomqlOutput,
        fieldPath.concat(field)
      );
    } else if (
      jomqlResolverObject[field].nested &&
      !jomqlResolverObject[field].typeDef.dataloader
    ) {
      // if field
      const nestedResolverObject = jomqlResolverObject[field].nested;
      if (nestedResolverObject)
        await processJomqlResolverTree(
          jomqlOutput[field],
          nestedResolverObject,
          jomqlResolverObject[field].typename,
          req,
          args,
          fieldPath.concat(field)
        );
    }

    // if typeDef of field is ScalarDefinition, apply the serialize function to the end result
    const type = jomqlResolverObject[field].typeDef.type;
    if (isScalarDefinition(type)) {
      if (type.serialize)
        jomqlOutput[field] = await type.serialize(
          jomqlOutput[field],
          fieldPath
        );
    }

    // check for nulls
    validateResultFields(
      jomqlOutput[field],
      jomqlResolverObject[field].typeDef,
      fieldPath
    );
  }
}

export async function handleAggregatedQueries(
  resultsArray: JomqlOutput[],
  jomqlResolverObject: JomqlResolverObject,
  typename: string,
  req: Request,
  args: JomqlQueryArgs,
  fieldPath: string[] = []
) {
  for (const field in jomqlResolverObject) {
    const dataloaderFn = jomqlResolverObject[field].typeDef.dataloader;
    const nestedResolver = jomqlResolverObject[field].nested;
    if (dataloaderFn && jomqlResolverObject[field].query) {
      const keySet = new Set();

      // aggregate ids
      resultsArray.forEach((result) => {
        if (result) keySet.add(result[field]);
      });

      // lookup all the ids
      const aggregatedResults = await dataloaderFn(
        req,
        { id: [...keySet] },
        jomqlResolverObject[field].query,
        typename,
        {},
        fieldPath.concat(field)
      );

      // build id -> record map
      const recordMap = new Map();
      aggregatedResults.forEach((result: any) => {
        recordMap.set(result.id, result);
      });

      // join the records in memory
      resultsArray.forEach((result) => {
        if (result) result[field] = recordMap.get(result[field]);
      });
    } else if (nestedResolver) {
      // if field does not have a dataloader, it must be nested.
      // build the array of records that will need replacing and go deeper
      const nestedResultsArray = resultsArray.map((result) => {
        if (result) return result[field];
      });

      await handleAggregatedQueries(
        nestedResultsArray,
        nestedResolver,
        jomqlResolverObject[field].typename,
        req,
        args,
        fieldPath.concat(field)
      );
    }
  }
}
