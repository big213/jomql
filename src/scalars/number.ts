import type { ScalarDefinition } from "../types";
import { JomqlFieldError } from "../classes";

function validate(value: unknown, fieldPath: string[]) {
  if (value === null) return value;
  const parsedValue = Number(value);
  if (Number.isNaN(parsedValue))
    throw new JomqlFieldError("Invalid number", fieldPath);

  return parsedValue;
}

export const number: ScalarDefinition = {
  name: "number",
  types: ["number"],
  description: "Numerical value",
  serialize: validate,
  parseValue: validate,
};
