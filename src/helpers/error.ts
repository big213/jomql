import { ErrorWrapper } from "../classes/errorWrapper";

export default {
  generateError(message: string, statusCode = 400, errorCode = "misc/other") {
    return new ErrorWrapper(message, statusCode, errorCode);
  },
};
