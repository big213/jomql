import { JomqlBaseError } from "..";
export class JomqlQueryError extends JomqlBaseError {
  constructor(params: { message: string; fieldPath: string[] }) {
    const { message, fieldPath } = params;
    super({
      errorName: "JomqlQueryError",
      message,
      fieldPath,
      statusCode: 400,
    });
  }
}
