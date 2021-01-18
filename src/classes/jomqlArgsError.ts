import { JomqlBaseError } from ".";
export class JomqlArgsError extends JomqlBaseError {
  constructor(params: { message: string; fieldPath: string[] }) {
    const { message, fieldPath } = params;
    super({
      errorName: "JomqlArgsError",
      message,
      fieldPath,
      statusCode: 400,
    });
  }
}
