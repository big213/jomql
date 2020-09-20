import { ErrorWrapper } from '../../classes/errorWrapper';

export default {
  generateError(message: string, statusCode = 400, errorCode = "misc/other") {
    return new ErrorWrapper(message, statusCode, errorCode);
  },

  wrapError(error: Error) {
    return new ErrorWrapper(error.message, 500, "system-generated-error", error);
  },

  invalidSqlError() {
    return new ErrorWrapper("Internal Server Error", 500, "system-error");
  },
};