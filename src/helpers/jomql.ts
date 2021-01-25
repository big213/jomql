import {
  getLookupValue,
  getTypeDefs,
  getInputDefs,
  lookupSymbol,
  BaseScalars,
} from "..";
import { JomqlArgsError, JomqlQueryError, JomqlResultError } from "../classes";

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
  RootResolverObject,
  JomqlProcessorFunction,
  TypeDefinitionField,
  isTypeDefinitionField,
  ScalarDefinition,
  isTypeDefinition,
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
        throw new JomqlArgsError({
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

// traverses results according to JomqlResolverTree and validates nulls, arrays, extracts results from objs
export async function validateJomqlResults(
  jomqlResultsNode: unknown,
  jomqlResolverNode: JomqlResolverNode,
  fieldPath: string[]
) {
  let returnValue: any;

  const nested = jomqlResolverNode.nested;

  if (nested) {
    // if output is null, cut the tree short and return
    if (jomqlResultsNode === null) return null;
    if (jomqlResolverNode.typeDef.isArray) {
      if (Array.isArray(jomqlResultsNode)) {
        returnValue = await Promise.all(
          jomqlResultsNode.map(async (ele) => {
            const arrReturnValue: any = {};
            for (const field in jomqlResolverNode.nested) {
              arrReturnValue[field] = await validateJomqlResults(
                ele[field],
                jomqlResolverNode.nested[field],
                fieldPath.concat(field)
              );
            }
            return arrReturnValue;
          })
        );
      } else {
        throw new JomqlResultError({
          message: `Expecting array`,
          fieldPath: fieldPath,
        });
      }
    } else {
      if (!isObject(jomqlResultsNode))
        throw new JomqlResultError({
          message: `Expecting object`,
          fieldPath: fieldPath,
        });

      returnValue = {};
      for (const field in jomqlResolverNode.nested) {
        returnValue[field] = await validateJomqlResults(
          jomqlResultsNode[field],
          jomqlResolverNode.nested[field],
          fieldPath.concat(field)
        );
      }
    }
  } else {
    // check for nulls and ensure array fields are arrays
    validateResultFields(
      jomqlResultsNode,
      jomqlResolverNode.typeDef,
      fieldPath
    );

    // if typeDef of field is ScalarDefinition, apply the serialize function to the end result
    let fieldType = jomqlResolverNode.typeDef.type;

    if (typeof fieldType === "string") {
      const typeDef = getTypeDefs().get(fieldType);
      if (!typeDef) {
        throw new JomqlQueryError({
          message: `TypeDef '${fieldType}' not found`,
          fieldPath: fieldPath,
        });
      }
      fieldType = typeDef;
    }

    if (isTypeDefinition(fieldType)) {
      returnValue = jomqlResultsNode;
    } else {
      const serializeFn = fieldType.serialize;
      // if field is null, skip
      if (serializeFn && jomqlResultsNode !== null) {
        try {
          if (
            Array.isArray(jomqlResultsNode) &&
            jomqlResolverNode.typeDef.isArray
          ) {
            returnValue = jomqlResultsNode.map((ele: unknown) =>
              serializeFn(ele)
            );
          } else {
            returnValue = await serializeFn(jomqlResultsNode);
          }
        } catch {
          // transform any errors thrown into JomqlParseError
          throw new JomqlResultError({
            message: `Invalid scalar value for '${fieldType.name}'`,
            fieldPath: fieldPath,
          });
        }
      } else {
        returnValue = jomqlResultsNode;
      }
    }
  }

  return returnValue;
}

// throws an error if a field is not an array when it should be
export function validateResultFields(
  value: unknown,
  resolverObject: ResolverObject,
  fieldPath: string[]
) {
  if (resolverObject.isArray) {
    if (!Array.isArray(value)) {
      throw new JomqlResultError({
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
    throw new JomqlResultError({
      message: `Null value not allowed`,
      fieldPath,
    });
  }
}

// starts generateJomqlResolverTree from a TypeDef
export function generateAnonymousRootResolver(
  type: TypeDefinition | string | ScalarDefinition
): TypeDefinitionField {
  const anonymousRootResolver: TypeDefinitionField = {
    allowNull: true,
    type,
  };

  return anonymousRootResolver;
}

export function generateJomqlResolverTree(
  fieldValue: unknown,
  resolverObject: TypeDefinitionField | RootResolverObject,
  fieldPath: string[] = [],
  fullTree = false
): JomqlResolverNode {
  let fieldType = resolverObject.type;

  // if string, attempt to convert to TypeDefinition
  if (typeof fieldType === "string") {
    const typeDef = getTypeDefs().get(fieldType);
    if (!typeDef) {
      throw new JomqlQueryError({
        message: `TypeDef '${fieldType}' not found`,
        fieldPath: fieldPath,
      });
    }
    fieldType = typeDef;
  }

  // define the lookupValue
  const lookupValue = getLookupValue();

  // field must either be lookupValue OR an object
  // check if field is lookupValue
  const isLookupField =
    fieldValue === lookupValue || fieldValue === lookupSymbol;

  const isLeafNode = !isTypeDefinition(fieldType);

  // field must either be lookupValue OR an object
  if (!isLookupField && !isObject(fieldValue))
    throw new JomqlQueryError({
      message: `Invalid field RHS`,
      fieldPath: fieldPath,
    });

  // if leafNode and nested, MUST be only with __args
  if (isLeafNode && isObject(fieldValue)) {
    if (!("__args" in fieldValue) || Object.keys(fieldValue).length !== 1)
      throw new JomqlQueryError({
        message: `Scalar node can only accept __args and no other field`,
        fieldPath,
      });
  }

  // if not leafNode and isLookupField, deny
  if (!isLeafNode && isLookupField)
    throw new JomqlQueryError({
      message: `Resolved node must be an object with nested fields`,
      fieldPath,
    });

  // if field is scalar and args is required, and not object, throw err
  if (isLeafNode && resolverObject.args?.required && !isObject(fieldValue)) {
    throw new JomqlQueryError({
      message: `Args required`,
      fieldPath,
    });
  }

  let nestedNodes: { [x: string]: JomqlResolverNode } | null = null;

  // separate args from query
  const { __args: args = null, ...query } = isObject(fieldValue)
    ? fieldValue
    : {};

  if (isObject(fieldValue)) {
    // validate args, if any
    validateExternalArgs(
      fieldValue.__args,
      resolverObject.args,
      fieldPath.concat("__args")
    );

    if (!isLeafNode && isTypeDefinition(fieldType)) {
      nestedNodes = {};

      // iterate over fields
      for (const field in fieldValue) {
        const parentsPlusCurrentField = fieldPath.concat(field);
        if (field === "__args") {
          continue;
        }

        // if field not in TypeDef, reject
        if (!(field in fieldType.fields)) {
          throw new JomqlQueryError({
            message: `Unknown field`,
            fieldPath: parentsPlusCurrentField,
          });
        }

        // deny hidden fields
        if (fieldType.fields[field].hidden) {
          throw new JomqlQueryError({
            message: `Hidden field`,
            fieldPath: parentsPlusCurrentField,
          });
        }

        // only if no resolver do we recursively add to tree
        // if there is a resolver, the sub-tree should be generated in the resolver
        if (fullTree || !resolverObject.resolver)
          nestedNodes[field] = generateJomqlResolverTree(
            fieldValue[field],
            fieldType.fields[field],
            parentsPlusCurrentField,
            fullTree
          );
      }
    }
  }
  return {
    typeDef: resolverObject,
    query,
    args,
    nested: nestedNodes ?? undefined,
  };
}

// resolves the queries, and attaches them to the obj (if possible)
export const processJomqlResolverTree: JomqlProcessorFunction = async ({
  jomqlResultsNode,
  jomqlResolverNode,
  parentNode,
  req,
  data = {},
  fieldPath = [],
}) => {
  let returnValue: any;
  const resolverFn = jomqlResolverNode.typeDef.resolver;
  const nested = jomqlResolverNode.nested;
  if (resolverFn) {
    if (!jomqlResolverNode.typeDef.defer) {
      returnValue = await resolverFn({
        req,
        fieldPath,
        args: jomqlResolverNode.args,
        query: jomqlResolverNode.query,
        fieldValue: jomqlResultsNode,
        parentValue: parentNode,
        data,
      });
    }
  } else if (nested && isObject(jomqlResultsNode)) {
    // must be nested field.
    returnValue = jomqlResultsNode;

    for (const field in jomqlResolverNode.nested) {
      const currentFieldPath = fieldPath.concat(field);
      returnValue[field] = await processJomqlResolverTree({
        jomqlResultsNode: isObject(jomqlResultsNode)
          ? jomqlResultsNode[field]
          : null,
        parentNode: returnValue,
        jomqlResolverNode: jomqlResolverNode.nested[field],
        req,
        data,
        fieldPath: currentFieldPath,
      });
    }
  }

  return returnValue ?? jomqlResultsNode;
};
