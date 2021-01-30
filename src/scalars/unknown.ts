import { JomqlScalarType } from "../classes";

export const unknown = new JomqlScalarType({
  name: "unknown",
  types: ["unknown"],
  description: "Unknown value",
});
