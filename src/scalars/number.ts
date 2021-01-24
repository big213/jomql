import type { ScalarDefinition } from "..";

function validate(value: unknown) {
  const parsedValue = Number(value);
  if (Number.isNaN(Number(value))) throw true;

  return parsedValue;
}

export const number: ScalarDefinition = {
  name: "number",
  types: ["number"],
  description: "Numerical value",
  serialize: validate,
  parseValue: validate,
};
