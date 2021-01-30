import type { ScalarDefinition } from "../types";
import { scalarTypeDefs } from "..";
import { JomqlInitializationError } from "./error/jomqlInitializationError";

export class JomqlScalarType {
  definition;
  constructor(params: ScalarDefinition, allowDuplicate = false) {
    this.definition = params;

    // register this typeDef
    if (scalarTypeDefs.has(params.name)) {
      if (!allowDuplicate)
        throw new JomqlInitializationError({
          message: `JomqlScalarType already registered for '${params.name}'`,
        });
    } else {
      scalarTypeDefs.set(params.name, this);
    }
  }
}
