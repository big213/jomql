import { Request } from "express";
import { getLookupValue, getTypeDefs, getInputDefs, lookupSymbol } from "..";
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
import { JomqlArgsError, JomqlFieldError, JomqlParseError } from "../classes";

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

  // if no argDefinition and args provided, throw error
  if (!argDefinition) {
    if (args)
      throw new JomqlArgsError({
        message: `Not expecting any args`,
        fieldPath,
      });
    else return;
  }

  // if no arg required and args is undefined, return
  if (!argDefinition.required && args === undefined) return;

  // if argDefinition.required and args is undefined, throw err
  if (argDefinition.required && args === undefined)
    throw new JomqlArgsError({
      message: `Args is required`,
      fieldPath,
    });

  // if argDefinition.isArray and args is not array, throw err
  if (argDefinition.isArray && !Array.isArray(args))
    throw new JomqlArgsError({
      message: `Array expected`,
      fieldPath,
    });

  let argDefType = argDefinition.type;

  // if string, fetch the inputDef from the map
  if (typeof argDefType === "string") {
    const inputDef = getInputDefs().get(argDefType);
    if (!inputDef)
      throw new JomqlArgsError({
        message: `Unknown inputDef '${argDefType}'`,
        fieldPath,
      });
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
        throw new JomqlArgsError({
          message: `Object expected`,
          fieldPath,
        });

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
        throw new JomqlArgsError({
          message: `Unknown args '${[...keysToValidate].join(",")}'`,
          fieldPath,
        });
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

    // if arg is null, skip
    if (parseValue && args !== null) {
      try {
        // if arg is an array and supposed to be array, loop through
        if (Array.isArray(args) && argDefinition.isArray) {
          parsedArgs = args.map((ele: unknown) => parseValue(ele));
        } else {
          parsedArgs = parseValue(args);
        }
      } catch {
        // transform any errors thrown into JomqlParseError
        throw new JomqlParseError({
          message: `Invalid scalar value for '${argDefType.name}'`,
          fieldPath: fieldPath,
        });
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
  if (resolverObject.isArray) {
    if (!Array.isArray(value)) {
      throw new JomqlFieldError({
        message: `Array expected`,
        fieldPath,
      });
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
    throw new JomqlFieldError({
      message: `Null value not allowed`,
      fieldPath,
    });
  }
}

export function generateJomqlResolverTree(
  externalQuery: JomqlQuery,
  typeDef: TypeDefinition,
  fieldPath: string[] = []
): JomqlResolverNode {
  if (!typeDef)
    throw new JomqlFieldError({
      message: `Invalid typeDef`,
      fieldPath,
    });

  const jomqlResolverNode: JomqlResolverNode = {};

  // define the lookupValue
  const lookupValue = getLookupValue();

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
    const parentsPlusCurrentField = fieldPath.concat(field);

    if (!(field in typeDef.fields))
      throw new JomqlFieldError({
        message: `Unknown field`,
        fieldPath: parentsPlusCurrentField,
      });

    // deny hidden fields
    if (typeDef.fields[field].hidden) {
      throw new JomqlFieldError({
        message: `Hidden field`,
        fieldPath: parentsPlusCurrentField,
      });
    }

    // deny fields with no type
    if (!typeDef.fields[field].type) {
      throw new JomqlFieldError({
        message: `Mis-configured field`,
        fieldPath: parentsPlusCurrentField,
      });
    }

    // field must either be lookupValue OR an object

    // check if field is lookupValue
    const isLookupField =
      externalQuery[field] === lookupValue ||
      externalQuery[field] === lookupSymbol;

    const isNestedField = isObject(externalQuery[field]);

    const type = typeDef.fields[field].type;

    const isLeafNode = isScalarDefinition(type);

    // field must either be lookupValue OR an object
    if (!isLookupField && !isNestedField)
      throw new JomqlFieldError({
        message: `Invalid field RHS`,
        fieldPath: parentsPlusCurrentField,
      });

    // if leafNode and nested, MUST be only with __args
    if (isLeafNode && isNestedField) {
      if (
        !("__args" in externalQuery[field]) ||
        Object.keys(externalQuery[field]).length !== 1
      )
        throw new JomqlFieldError({
          message: `Scalar node can only accept __args and no other field`,
          fieldPath: parentsPlusCurrentField,
        });
    }

    // if not leafNode and isLookupField, deny
    if (!isLeafNode && isLookupField)
      throw new JomqlFieldError({
        message: `Resolved node must be an object with nested fields`,
        fieldPath: parentsPlusCurrentField,
      });

    const typename = isScalarDefinition(type) ? type.name : type;

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
        fieldPath.concat([field, "__args"])
      );

      jomqlResolverNode[field].query = externalQuery[field];

      // only if no resolver do we recursively add to tree
      // if there is a resolver, the sub-tree should be generated in the resolver
      if (!typeDef.fields[field].resolver) {
        const nestedTypeDef = getTypeDefs().get(typename);

        if (!nestedTypeDef) {
          throw new JomqlFieldError({
            message: `TypeDef for '${typename}' not found`,
            fieldPath: parentsPlusCurrentField,
          });
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
  /*   if (typename && isObject(jomqlResultsNode)) {
    jomqlResultsNode.__typename = typename;
  } */

  for (const field in jomqlResolverNode) {
    const currentFieldPath = fieldPath.concat(field);
    // if field has a resolver, attempt to resolve and put in obj
    const resolverFn = jomqlResolverNode[field].typeDef.resolver;

    // if query is empty, must be raw lookup field. skip
    if (resolverFn) {
      jomqlResultsNode[field] = await resolverFn({
        req,
        fieldPath: currentFieldPath,
        args,
        query: jomqlResolverNode[field].query,
        typename: jomqlResolverNode[field].typename,
        currentObject: jomqlResultsNode,
      });
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
          currentFieldPath
        );
    }

    // check for nulls and ensure array fields are arrays
    validateResultFields(
      jomqlResultsNode[field],
      jomqlResolverNode[field].typeDef,
      currentFieldPath
    );

    // if typeDef of field is ScalarDefinition, apply the serialize function to the end result
    const type = jomqlResolverNode[field].typeDef.type;

    if (isScalarDefinition(type)) {
      const serializeFn = type.serialize;
      // if field is null, skip
      if (serializeFn && jomqlResultsNode[field] !== null) {
        try {
          if (
            Array.isArray(jomqlResultsNode[field]) &&
            jomqlResolverNode[field].typeDef.isArray
          ) {
            jomqlResultsNode[field] = jomqlResultsNode[
              field
            ].map((ele: unknown) => serializeFn(ele));
          } else {
            jomqlResultsNode[field] = await serializeFn(
              jomqlResultsNode[field]
            );
          }
        } catch {
          // transform any errors thrown into JomqlParseError
          throw new JomqlParseError({
            message: `Invalid scalar value for '${type.name}'`,
            fieldPath: currentFieldPath,
          });
        }
      }
    }
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
    const currentFieldPath = fieldPath.concat(field);
    const dataloaderFn = jomqlResolverNode[field].typeDef.dataloader;
    const nestedResolver = jomqlResolverNode[field].nested;
    if (dataloaderFn && jomqlResolverNode[field].query) {
      const keySet = new Set();

      // aggregate ids
      resultsArray.forEach((result) => {
        if (result) keySet.add(result[field]);
      });

      // lookup all the ids
      const aggregatedResults = await dataloaderFn({
        req,
        args: { id: [...keySet] },
        query: jomqlResolverNode[field].query!,
        typename,
        currentObject: {},
        fieldPath: currentFieldPath,
      });

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
        currentFieldPath
      );
    }
  }
}
