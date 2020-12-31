import { ErrorWrapper } from "../classes/errorWrapper";
import { JomqlResponse } from "../types";
import { isDebug } from "..";

export function generateErrorResponse(error: ErrorWrapper): JomqlResponse {
  return generateJomqlResponse(null, error);
}

export function generateNormalResponse(data: any): JomqlResponse {
  return generateJomqlResponse(data);
}

function generateJomqlResponse(data: any, error?: ErrorWrapper): JomqlResponse {
  return {
    data: data,
    ...(error && {
      error: {
        message: error.errorMessage,
        ...(isDebug() && { stack: error.errorObject?.stack }),
      },
    }),
  };
}
