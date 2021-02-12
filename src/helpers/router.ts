import { Request, Response } from "express";
import { generateNormalResponse, generateErrorResponse } from "./response";
import { JomqlBaseError, JomqlQueryError, JomqlScalarType } from "../classes";
import { getParams, lookupSymbol, rootResolvers } from "..";
import {
  isObject,
  validateJomqlResults,
  processJomqlResolverTree,
  generateJomqlResolverTree,
} from "./jomql";
import type { RootResolverDefinition } from "../types";

export function createRestRequestHandler(
  rootResolverObject: RootResolverDefinition,
  operationName: string
) {
  return async function (req: Request, res: Response): Promise<void> {
    try {
      const fieldPath = [operationName];

      const argsTransformer = rootResolverObject.restOptions?.argsTransformer;

      // generate args
      let args = argsTransformer
        ? argsTransformer(req)
        : {
            ...req.query,
            ...req.params,
          };

      // if __args is object with no keys, set to undefined
      if (isObject(args) && !Object.keys(args).length) args = undefined;

      let jomqlQuery;

      const presetQuery = rootResolverObject.restOptions?.query;
      // if type is scalar and args !== undefined, construct query
      if (
        rootResolverObject.type instanceof JomqlScalarType &&
        args !== undefined
      ) {
        jomqlQuery = {
          __args: args,
        };
      } else if (isObject(presetQuery)) {
        // build jomqlQuery
        jomqlQuery = {
          ...presetQuery,
          __args: args,
        };
      } else {
        jomqlQuery = presetQuery ?? lookupSymbol;
      }

      // validate query in-place
      const jomqlResolverTree = generateJomqlResolverTree(
        jomqlQuery,
        rootResolverObject,
        fieldPath,
        true
      );

      // processes the tree
      const results = await processJomqlResolverTree({
        jomqlResolverNode: jomqlResolverTree,
        req,
        fieldPath,
        fullTree: getParams().processEntireTree,
      });

      // traverse results and extract records, validate nulls, arrays, etc.
      const validatedResults = await validateJomqlResults(
        results,
        jomqlResolverTree,
        fieldPath
      );

      sendSuccessResponse(validatedResults, res);
    } catch (err) {
      sendErrorResponse(err, res);
    }
  };
}

export function createJomqlRequestHandler() {
  return async function (req: Request, res: Response): Promise<void> {
    try {
      // handle jomql queries, check if req.body is object
      if (!isObject(req.body)) {
        throw new JomqlQueryError({
          message: `Request body must be object`,
          fieldPath: [],
        });
      }

      // req must be an object at this point
      const requestedOperations = Object.keys(req.body);

      if (requestedOperations.length !== 1)
        throw new JomqlQueryError({
          message: `Exactly 1 root query required`,
          fieldPath: [],
        });

      const operation = requestedOperations[0];
      const query = req.body[operation];
      const fieldPath = [operation];

      const rootResolver = rootResolvers.get(operation);

      if (!rootResolver) {
        throw new JomqlQueryError({
          message: `Unrecognized jomql root query '${operation}'`,
          fieldPath: [],
        });
      }

      // validate query in-place
      const jomqlResolverTree = generateJomqlResolverTree(
        query,
        rootResolver.definition,
        fieldPath,
        true
      );

      // processes the resolvers
      const results = await processJomqlResolverTree({
        jomqlResolverNode: jomqlResolverTree,
        req,
        fieldPath,
        fullTree: getParams().processEntireTree,
      });

      // traverse results and extract records, validate nulls, arrays, etc.
      const validatedResults = await validateJomqlResults(
        results,
        jomqlResolverTree,
        fieldPath
      );

      sendSuccessResponse(validatedResults, res);
    } catch (err) {
      sendErrorResponse(err, res);
    }
  };
}

function sendErrorResponse(err: Error, res: Response) {
  if (getParams().debug) {
    console.log(err);
  }

  // if not a JomqlError, wrap it
  const validatedError =
    err instanceof JomqlBaseError
      ? err
      : new JomqlBaseError({
          errorName: "JomqlGenericError",
          message: err.message,
          fieldPath: [],
        });

  const errorResponseObject = generateErrorResponse(validatedError);

  return res.status(validatedError.statusCode).send(errorResponseObject);
}

function sendSuccessResponse(results: any, res: Response) {
  const responseObject = generateNormalResponse(results);

  res.header("Content-Type", "application/json");
  res.status(200).send(responseObject);
}
