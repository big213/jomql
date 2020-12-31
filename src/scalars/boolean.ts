import type { ScalarDefinition } from "../types";
import { JomqlFieldError } from "../classes";

function validate(value: unknown, fieldPath: string[]) {
  if (value === null) return value;
  if (typeof value !== "boolean")
    throw new JomqlFieldError("Invalid boolean", fieldPath);

  return value;
}

export const boolean: ScalarDefinition = {
  name: "boolean",
  types: ["boolean"],
  // since mysql could store booleans as tinyint, will allow casting as boolean based on truthyness
  serialize: (value: unknown, fieldPath: string[]) => {
    if (value === null) return value;
    return !!value;
  },
  parseValue: validate,
};
