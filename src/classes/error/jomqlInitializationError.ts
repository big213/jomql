import { JomqlBaseError } from "..";
export class JomqlInitializationError extends JomqlBaseError {
  constructor(params: { message: string; fieldPath?: string[] }) {
    const { message, fieldPath } = params;
    super({
      errorName: "JomqlInitializationError",
      message,
      fieldPath,
      statusCode: 400,
    });
  }
}
