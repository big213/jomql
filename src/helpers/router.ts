import type { Request, Response } from "express";
import { generateNormalResponse, generateErrorResponse } from "./response";
import { JomqlBaseError, JomqlFieldError } from "../classes";
import { isDebug } from "..";
import { RootResolverObject } from "../types";
import { isObject, validateExternalArgs, validateResultFields } from "./jomql";

export function createRestRequestHandler(
  rootResolverObject: RootResolverObject,
  operationName: string
) {
  return async function (req: Request, res: Response) {
    try {
      const results = await rootResolverObject.resolver({
        req,
        fieldPath: [operationName],
        args: {
          ...req.query,
          ...req.params,
        },
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
      if (!isObject(req.body)) {
        throw new JomqlFieldError({
          message: `Request body must be object`,
          fieldPath: [],
        });
      }

      // req must be an object at this point
      const requestedOperations = Object.keys(req.body);

      if (requestedOperations.length !== 1)
        throw new JomqlFieldError({
          message: `Exactly 1 root query required`,
          fieldPath: [],
        });

      const operation = requestedOperations[0];
      const query = req.body[operation];

      const rootResolverObject = allRootResolversMap.get(operation);

      if (rootResolverObject) {
        const { __args: jomqlArgs, ...jomqlQuery } = query;
        // validate args in place.
        validateExternalArgs(jomqlArgs, rootResolverObject.args, [
          operation,
          "__args",
        ]);

        const results = await rootResolverObject.resolver({
          req,
          fieldPath: [operation],
          args: jomqlArgs,
          query: jomqlQuery,
        });

        // validate if result is null, array, etc.
        validateResultFields(results, rootResolverObject, [operation]);

        sendSuccessResponse(results, res);
      } else {
        throw new JomqlFieldError({
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

function sendSuccessResponse(results: Error, res: Response) {
  const responseObject = generateNormalResponse(results);

  res.header("Content-Type", "application/json");
  res.status(200).send(responseObject);
}
