import type { Request, Response } from "express";
import { generateNormalResponse, generateErrorResponse } from "./response";
import { JomqlBaseError, JomqlQueryError } from "../classes";
import { isDebug, getCustomProcessor, lookupSymbol } from "..";
import {
  isObject,
  validateJomqlResults,
  processJomqlResolverTree,
  generateJomqlResolverTree,
} from "./jomql";
import type { RootResolverObject, JomqlQueryArgs, JomqlQuery } from "../types";

export function createRestRequestHandler(
  rootResolverObject: RootResolverObject,
  operationName: string
) {
  return async function (req: Request, res: Response) {
    try {
      const fieldPath = [operationName];
      const args = <JomqlQueryArgs>{
        ...req.query,
        ...req.params,
      };

      // if no query, use wildcard lookup as fallback
      const query = rootResolverObject.query ?? { "*": lookupSymbol };

      const jomqlQuery: JomqlQuery = {
        ...query,
        __args: args,
      };

      // validate query in-place
      const jomqlResolverTree = generateJomqlResolverTree(
        jomqlQuery,
        rootResolverObject,
        fieldPath,
        true
      );

      const results = await rootResolverObject.resolver({
        req,
        query: jomqlQuery,
        fieldPath,
        args,
      });

      if (!getCustomProcessor())
        await processJomqlResolverTree({
          jomqlResultsNode: results,
          jomqlResolverNode: jomqlResolverTree,
          req,
          fieldPath,
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

export function createJomqlRequestHandler(
  allRootResolversMap: Map<string, RootResolverObject>
) {
  return async function (req: Request, res: Response) {
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

      const rootResolverObject = allRootResolversMap.get(operation);

      if (rootResolverObject) {
        // validate query in-place
        const jomqlResolverTree = generateJomqlResolverTree(
          query,
          rootResolverObject,
          fieldPath,
          true
        );

        const { __args: jomqlArgs, ...jomqlQuery } = query;

        let results = await rootResolverObject.resolver({
          req,
          fieldPath,
          args: jomqlArgs,
          query: jomqlQuery,
        });

        // processes the resolvers if not using a custom processor
        if (!getCustomProcessor())
          results = await processJomqlResolverTree({
            jomqlResultsNode: results,
            jomqlResolverNode: jomqlResolverTree,
            req,
            fieldPath,
          });

        // traverse results and extract records, validate nulls, arrays, etc.
        const validatedResults = await validateJomqlResults(
          results,
          jomqlResolverTree,
          fieldPath
        );

        sendSuccessResponse(validatedResults, res);
      } else {
        throw new JomqlQueryError({
          message: `Unrecognized jomql root query '${operation}'`,
          fieldPath: [],
        });
      }
    } catch (err) {
      sendErrorResponse(err, res);
    }
  };
}

function sendErrorResponse(err: Error, res: Response) {
  if (isDebug()) {
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
