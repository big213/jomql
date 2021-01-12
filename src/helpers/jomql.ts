import { Request } from "express";
import { getLookupValue, getTypeDefs, getInputDefs } from "..";
import {
  TypeDefinition,
  JomqlResolverNode,
  JomqlQuery,
  JomqlQueryArgs,
  JomqlResultsNode,
  isScalarDefinition,
  ResolverObject,
  isInputTypeDefinition,
  ArgDefinition,
} from "../types";

type stringKeyObject = { [x: string]: any };

export function isObject(ele: unknown): ele is stringKeyObject {
  return Object.prototype.toString.call(ele) === "[object Object]";
}

// validates and replaces the args in place
export function validateExternalArgs(
  args: JomqlQueryArgs | undefined,
  argDefinition: ArgDefinition | undefined,
  fieldPath: string[]
) {
  let parsedArgs;

  const fieldString = ["root"].concat(...fieldPath).join(".");

  // if no argDefinition and args provided, throw error
  if (!argDefinition) {
    if (args)
      throw new Error(`Not expecting any args for field: '${fieldString}'`);
    else return;
  }

  // if no arg required and args is undefined, return
  if (!argDefinition.required && args === undefined) return;

  // if argDefinition.required and args is undefined, throw err
  if (argDefinition.required && args === undefined)
    throw new Error(`Args is required for field: '${fieldString}'`);

  // if argDefinition.isArray and args is not array, throw err
  if (argDefinition.isArray && !Array.isArray(args))
    throw new Error(`Expecting array for field: '${fieldString}'`);

  let argDefType = argDefinition.type;

  // if string, fetch the inputDef from the map
  if (typeof argDefType === "string") {
    const inputDef = getInputDefs().get(argDefType);
    if (!inputDef)
      throw new Error(
        `Unknown inputDef '${argDefType}' for field '${fieldString}'`
      );
    argDefType = inputDef;
  }

  // if argDefinition.type is inputTypeDefinition
  if (isInputTypeDefinition(argDefType)) {
    let argsArray: (JomqlQueryArgs | undefined)[];
    const fields = argDefType.fields;
    // if args is array and it is supposed to be array, process each array element
    if (Array.isArray(args) && argDefinition.isArray) {
      argsArray = args;
    } else {
      argsArray = [args];
    }

    // process all args
    for (const arg of argsArray) {
      if (!isObject(arg))
        throw new Error(`Expecting object args for field: '${fieldString}'`);

      const keysToValidate = new Set(Object.keys(arg));
      Object.entries(fields).forEach(([key, argDef]) => {
        // validate each key of arg
        const validatedArg = validateExternalArgs(
          arg[key],
          argDef,
          fieldPath.concat(key)
        );
        // if key is undefined, make sure it is deleted
        if (validatedArg === undefined) delete arg[key];
        else arg[key] = validatedArg;
        keysToValidate.delete(key);
      });

      // check if any remaining keys to validate (aka unknown args)
      if (keysToValidate.size > 0) {
        throw new Error(
          `Unknown args '${[...keysToValidate].join(
            ","
          )}' for field: '${fieldString}'`
        );
      }

      // perform validation on results
      if (argDefType.inputsValidator) {
        argDefType.inputsValidator(arg, fieldPath);
      }
    }
  } else if (isScalarDefinition(argDefType)) {
    // if argDefinition.type is scalarDefinition, attempt to parseValue args
    // replace value if parseValue
    const parseValue = argDefType.parseValue;
    if (parseValue) {
      // if arg is an array and supposed to be array, loop through
      if (Array.isArray(args) && argDefinition.isArray) {
        parsedArgs = args.map((ele: unknown) => parseValue(ele, fieldPath));
      } else {
        parsedArgs = parseValue(args, fieldPath);
      }
    }
  } else {
    // must be string field, should never reach this case
  }

  /*
  // if an argsValidator function is available, also run that
  if (argDefinition.argsValidator) {
    argDefinition.argsValidator(parsedArgs, fieldPath);
  }
  */
  return parsedArgs ?? args;
}

// throws an error if a field is not an array when it should be
export function validateResultFields(
  value: unknown,
  resolverObject: ResolverObject,
  fieldPath: string[]
) {
  const fieldString = ["root"].concat(...fieldPath).join(".");
  if (resolverObject.isArray) {
    if (!Array.isArray(value)) {
      throw new Error(`Array value expected for field '${fieldString}'`);
    }
    value.forEach((ele) => {
      validateResultNullish(ele, resolverObject, fieldPath);
    });
  } else {
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
): JomqlResolverNode {
  if (!typeDef) throw new Error("Invalid typeDef");

  const jomqlResolverNode: JomqlResolverNode = {};

  //define the lookupValue
  const lookupValue = getLookupValue();

  //ensure the id field is there, if it is part of the typeDef
  if ("id" in typeDef.fields && !("id" in externalQuery)) {
    externalQuery.id = lookupValue;
  }

  //if the * field is provided, make sure all non-arg, non-hidden fields are there
  if ("*" in externalQuery && externalQuery["*"] === lookupValue) {
    for (const field in typeDef.fields) {
      if (
        !typeDef.fields[field].hidden &&
        !typeDef.fields[field].args &&
        !(field in externalQuery)
      ) {
        externalQuery[field] = lookupValue;
      }
    }
    delete externalQuery["*"];
  }

  for (const field in externalQuery) {
    // no longer validating args field here. at root level, args should always be handled in router.ts
    /*
    if (field === "__args") {
      validateExternalArgs(
        externalQuery.__args,
        typeDef.fields[field].args,
        parentFields
      );
      continue;
    }
    */

    const parentsPlusCurrentField = parentFields.concat(field);

    if (!(field in typeDef.fields))
      throw new Error(
        `Invalid Query: Unknown field '${parentsPlusCurrentField.join(".")}'`
      );

    // deny hidden fields
    if (typeDef.fields[field].hidden) {
      throw new Error(
        `Invalid Query: Hidden field '${parentsPlusCurrentField.join(".")}'`
      );
    }

    // deny fields with no type
    if (!typeDef.fields[field].type) {
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

    const type = typeDef.fields[field].type;

    const typename = isScalarDefinition(type) ? type.name : type;

    // if is ScalarDefinition, set type to type.name and getter to type.serialize
    jomqlResolverNode[field] = {
      typename,
      typeDef: typeDef.fields[field],
    };

    // if nested field, set query and nested
    if (isNestedField) {
      // validate the query.__args at this point
      validateExternalArgs(
        externalQuery[field].__args,
        typeDef.fields[field].args,
        [field].concat(parentFields)
      );

      jomqlResolverNode[field].query = externalQuery[field];

      // only if no resolver do we recursively add to tree
      // if there is a resolver, the sub-tree should be generated in the resolver
      if (!typeDef.fields[field].resolver) {
        const nestedTypeDef = getTypeDefs().get(typename);

        if (!nestedTypeDef) {
          throw new Error(`TypeDef for '${typename}' not found`);
        }

        jomqlResolverNode[field].nested = generateJomqlResolverTree(
          externalQuery[field],
          nestedTypeDef,
          parentsPlusCurrentField
        );
      }
    }
  }

  return jomqlResolverNode;
}

// resolves the queries, and attaches them to the obj (if possible)
export async function processJomqlResolverTree(
  jomqlResultsNode: JomqlResultsNode,
  jomqlResolverNode: JomqlResolverNode,
  typename: string,
  req: Request,
  args: JomqlQueryArgs,
  fieldPath: string[] = []
) {
  // if output is null, cut the tree short and return
  if (jomqlResultsNode === null) return;

  // add the typename field if the output is an object and there is a corresponding type
  if (typename && isObject(jomqlResultsNode)) {
    jomqlResultsNode.__typename = typename;
  }

  for (const field in jomqlResolverNode) {
    // if field has a resolver, attempt to resolve and put in obj
    const resolverFn = jomqlResolverNode[field].typeDef.resolver;

    // if query is empty, must be raw lookup field. skip
    if (resolverFn) {
      jomqlResultsNode[field] = await resolverFn(
        req,
        args,
        jomqlResolverNode[field].query,
        jomqlResolverNode[field].typename,
        jomqlResultsNode,
        fieldPath.concat(field)
      );
    } else if (
      jomqlResolverNode[field].nested &&
      !jomqlResolverNode[field].typeDef.dataloader
    ) {
      // if field
      const nestedResolverObject = jomqlResolverNode[field].nested;
      if (nestedResolverObject)
        await processJomqlResolverTree(
          jomqlResultsNode[field],
          nestedResolverObject,
          jomqlResolverNode[field].typename,
          req,
          args,
          fieldPath.concat(field)
        );
    }

    // if typeDef of field is ScalarDefinition, apply the serialize function to the end result
    const type = jomqlResolverNode[field].typeDef.type;
    if (isScalarDefinition(type)) {
      if (type.serialize)
        jomqlResultsNode[field] = await type.serialize(
          jomqlResultsNode[field],
          fieldPath
        );
    }

    // check for nulls
    validateResultFields(
      jomqlResultsNode[field],
      jomqlResolverNode[field].typeDef,
      fieldPath
    );
  }
}

export async function handleAggregatedQueries(
  resultsArray: JomqlResultsNode[],
  jomqlResolverNode: JomqlResolverNode,
  typename: string,
  req: Request,
  args: JomqlQueryArgs,
  fieldPath: string[] = []
) {
  for (const field in jomqlResolverNode) {
    const dataloaderFn = jomqlResolverNode[field].typeDef.dataloader;
    const nestedResolver = jomqlResolverNode[field].nested;
    if (dataloaderFn && jomqlResolverNode[field].query) {
      const keySet = new Set();

      // aggregate ids
      resultsArray.forEach((result) => {
        if (result) keySet.add(result[field]);
      });

      // lookup all the ids
      const aggregatedResults = await dataloaderFn(
        req,
        { id: [...keySet] },
        jomqlResolverNode[field].query,
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
      const nestedResultsArray = resultsArray.reduce(
        (total: JomqlResultsNode[], result) => {
          if (result) total.push(result[field]);
          return total;
        },
        []
      );

      await handleAggregatedQueries(
        nestedResultsArray,
        nestedResolver,
        jomqlResolverNode[field].typename,
        req,
        args,
        fieldPath.concat(field)
      );
    }
  }
}
