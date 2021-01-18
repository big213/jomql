import type { ScalarDefinition } from "../types";

function validate(value: unknown) {
  if (typeof value !== "string") throw true;
  return value;
}
export const string: ScalarDefinition = {
  name: "string",
  types: ["string"],
  description: "String value",
  parseValue: validate,
  serialize: validate,
};
