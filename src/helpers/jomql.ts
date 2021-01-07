import { Request } from "express";
import e = require("express");
import { getLookupValue, getTypeDefs, getInputDefs } from "..";
import {
  TypeDefinition,
  JomqlResolverObject,
  JomqlQuery,
  JomqlQueryArgs,
  JomqlOutput,
  isScalarDefinition,
  ResolverObject,
  InputTypeDefinition,
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
  inputTypeDefinition: InputTypeDefinition | undefined,
  fieldPath: string[]
): void {
  const fieldString = ["root"].concat(...fieldPath).join(".");

  // if no argDefinition and args provided, throw error
  if (!inputTypeDefinition) {
    if (args)
      throw new Error(`Not expecting any args for field: '${fieldString}'`);
    else return;
  }
  // if args is not object, throw err
  if (!isObject(args))
    throw new Error(`Args is malformed for field: '${fieldString}'`);

  const keysToValidate = new Set(Object.keys(args));

  // iterate through fields
  for (const key in inputTypeDefinition.fields) {
    const argDef = inputTypeDefinition.fields[key];
    // if no arg required and args is undefined, return/skip
    if (!argDef.required && args[key] === undefined) continue;

    // if argDefinition.required and args is undefined, throw err
    if (argDef.required && args[key] === undefined)
      throw new Error(`Args is required for field: '${key}'`);

    // if argDefinition.isArray and args is not array, throw err
    if (argDef.isArray && !Array.isArray(args[key]))
      throw new Error(`Expecting array for field: '${fieldString}'`);

    keysToValidate.delete(key);
    let type = argDef.type;
    // if string, fetch the inputDef from the map
    if (typeof type === "string") {
      const inputDef = getInputDefs().get(type);
      if (!inputDef)
        throw new Error(
          `Unknown inputDef '${type}' for field '${fieldString}'`
        );
      type = inputDef;
    }

    // if type is inputTypeDefinition, process
    if (isInputTypeDefinition(type)) {
      let argsArray: (JomqlQueryArgs | undefined)[];
      // if args[key] is array and it is supposed to be array, process each array element
      if (Array.isArray(args[key]) && argDef.isArray) {
        argsArray = args[key];
      } else {
        argsArray = [args[key]];
      }
      for (const arg of argsArray) {
        validateExternalArgs(arg, type, fieldPath.concat(key));
      }
    } else if (isScalarDefinition(type)) {
      // if argDefinition.type is scalarDefinition, attempt to parseValue args
      // replace value if parseValue
      const parseValue = type.parseValue;
      if (parseValue) {
        // if arg is an array, loop through
        if (Array.isArray(args[key]) && argDef.isArray) {
          args[key] = args[key].map((ele: unknown) =>
            parseValue(ele, fieldPath)
          );
        } else {
          args[key] = parseValue(args[key], fieldPath);
        }
      }
    } else {
      // should never reach this case
    }
  }

  // check if any remaining keys to validate (aka unknown args)
  if (keysToValidate.size > 0) {
    throw new Error(
      `Unknown args '${[...keysToValidate].join(
        ","
      )}' for field: '${fieldString}'`
    );
  }

  // run the inputsValidator function if available.
  if (inputTypeDefinition.inputsValidator) {
    inputTypeDefinition.inputsValidator(args, fieldPath);
  }
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
      validateExternalArgs(
        externalQuery.__args,
        typeDef[field].args,
        parentFields
      );
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
        typeDef[field].args,
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
