export class JomqlFieldError extends Error {
  constructor(message: string, fieldPath: string[]) {
    const fieldString = ["root"].concat(fieldPath).join(".");
    super(message + ` at field: '${fieldString}'`);
    this.name = "JomqlFieldError";
  }
}
