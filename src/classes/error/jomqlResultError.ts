import { JomqlBaseError } from "..";
export class JomqlResultError extends JomqlBaseError {
  constructor(params: { message: string; fieldPath: string[] }) {
    const { message, fieldPath } = params;
    super({
      errorName: "JomqlResultError",
      message,
      fieldPath,
      statusCode: 400,
    });
  }
}
