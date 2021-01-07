import { Request, Response } from "express";
import { generateNormalResponse, generateErrorResponse } from "./response";
import { ErrorWrapper } from "../classes/errorWrapper";
import { isDebug } from "..";
import { RootResolverObject } from "../types";
import { validateExternalArgs, validateResultFields } from "./jomql";

export function createRestRequestHandler(
  rootResolverObject: RootResolverObject,
  operationName: string
) {
  return async function (req: Request, res: Response) {
    try {
      const results = await rootResolverObject.resolver(req, {
        ...req.query,
        ...req.params,
      });

      // validate if result is null, array, etc.
      validateResultFields(results, rootResolverObject, [operationName]);

      sendSuccessResponse(results, res);
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
      if (Array.isArray(req.body)) throw new Error("Array body not allowed");

      // req must be an object at this point
      const requestedOperations = Object.keys(req.body);

      if (requestedOperations.length !== 1)
        throw new Error("Exactly 1 operation required");

      const operation = requestedOperations[0];
      const query = req.body[operation];

      const rootResolverObject = allRootResolversMap.get(operation);

      if (rootResolverObject) {
        let results;
        if (query) {
          const { __args: jomqlArgs, ...jomqlQuery } = query;
          // validate args in place.
          validateExternalArgs(jomqlArgs, rootResolverObject.args, [operation]);

          results = await rootResolverObject.resolver(
            req,
            jomqlArgs,
            jomqlQuery
          );
        } else {
          results = await rootResolverObject.resolver(req, {
            ...req.query,
            ...req.params,
          });
        }

        // validate if result is null, array, etc.
        validateResultFields(results, rootResolverObject, [operation]);

        sendSuccessResponse(results, res);
      } else {
        throw new Error("Unrecognized jomql operation");
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

  // if not a wrapped error, wrap it
  const wrappedError =
    err instanceof ErrorWrapper
      ? err
      : new ErrorWrapper(err.message, 500, "system-generated-error", err);

  const errorResponseObject = generateErrorResponse(wrappedError);

  return res.status(wrappedError.statusCode).send(errorResponseObject);
}

function sendSuccessResponse(results: Error, res: Response) {
  const responseObject = generateNormalResponse(results);

  res.header("Content-Type", "application/json");
  res.status(200).send(responseObject);
}
