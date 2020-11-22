import {
  generateNormalResponse,
  generateErrorResponse,
} from "../tier0/response";
import { ErrorWrapper } from "../../classes/errorWrapper";
import { isDebug } from "../..";
import { ResolverFunction } from "../../types";

export function externalFnWrapper(externalFn: ResolverFunction) {
  return async function (req, res) {
    try {
      let results;
      if (req.jomql) {
        const { __args: jomqlArgs, ...jomqlQuery } = req.jomql;
        results = await externalFn(req, jomqlArgs, jomqlQuery);
      } else {
        results = await externalFn(req, { ...req.query, ...req.params });
      }

      const responseObject = generateNormalResponse("object", results);

      res.header("Content-Type", "application/json");
      res.status(responseObject.statusCode ?? 200).send(responseObject);
    } catch (err) {
      if (isDebug()) {
        console.log(err);
      }
      // if not a wrapped error, wrap it
      const errorResponseObject = generateErrorResponse(
        err instanceof ErrorWrapper
          ? err
          : new ErrorWrapper(err.message, 500, "system-generated-error", err)
      );

      return res
        .status(errorResponseObject.statusCode)
        .send(errorResponseObject);
    }
  };
}
