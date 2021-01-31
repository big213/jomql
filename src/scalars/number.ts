import { JomqlScalarType } from "../classes";

function validate(value: unknown) {
  // must be number
  if (typeof value !== "number") throw true;
  return value;
}

export const number = new JomqlScalarType({
  name: "number",
  types: ["number"],
  description: "Numerical value",
  serialize: validate,
  parseValue: validate,
});
