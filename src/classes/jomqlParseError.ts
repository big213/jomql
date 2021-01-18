import { JomqlBaseError } from ".";
export class JomqlParseError extends JomqlBaseError {
  constructor(params: { message: string; fieldPath: string[] }) {
    const { message, fieldPath } = params;
    super({
      errorName: "JomqlParseError",
      message,
      fieldPath,
      statusCode: 400,
    });
  }
}
