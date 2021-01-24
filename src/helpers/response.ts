import { JomqlBaseError } from "../classes";
import { isDebug } from "..";
import { JomqlResponse } from "../types";

export function generateErrorResponse(error: JomqlBaseError): JomqlResponse {
  return generateJomqlResponse(null, error);
}

export function generateNormalResponse(data: any): JomqlResponse {
  return generateJomqlResponse(data);
}

function generateJomqlResponse(
  data: any,
  error?: JomqlBaseError
): JomqlResponse {
  return {
    data: data,
    ...(error && {
      error: {
        message: error.message,
        fieldPath: error.fieldPath,
        ...(isDebug() && { stack: error.stack }),
      },
    }),
  };
}
