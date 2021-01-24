import type { ScalarDefinition } from "..";

function validate(value: unknown) {
  if (typeof value !== "boolean") throw true;

  return value;
}

export const boolean: ScalarDefinition = {
  name: "boolean",
  types: ["boolean"],
  description: "True or False",
  // since mysql could store booleans as tinyint, will allow casting as boolean based on truthyness
  serialize: (value: unknown) => {
    return !!value;
  },
  parseValue: validate,
};
