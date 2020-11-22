import { Response } from "../../interfaces/response";
import { ErrorWrapper } from "../../classes/errorWrapper";

export function generateErrorResponse(error: ErrorWrapper): Response {
  return {
    message: error.errorMessage,
    dataType: "string",
    data: error.errorObject?.stack,
    responseType: "errorResponse",
    statusCode: error.statusCode,
  };
}

export function generateNormalResponse(dataType: string, data: any): Response {
  return {
    message: "OK",
    dataType: dataType,
    data: data,
    responseType: "successResponse",
    statusCode: 200,
  };
}

export function generateResponse(
  message: string,
  dataType: string,
  data: any,
  responseType: string,
  statusCode: 200
): Response {
  return {
    message: message,
    dataType: dataType,
    data: data,
    responseType: responseType,
    statusCode: statusCode,
  };
}
