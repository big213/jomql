import type { ScalarDefinition } from "../types";
import { scalarTypeDefs } from "..";
import { JomqlInitializationError } from "./error/jomqlInitializationError";

export class JomqlScalarType {
  definition;
  constructor(params: ScalarDefinition, allowOverride = true) {
    this.definition = params;

    // register this typeDef
    if (scalarTypeDefs.has(params.name)) {
      if (!allowOverride)
        throw new JomqlInitializationError({
          message: `JomqlScalarType already registered for '${params.name}'`,
        });
      else scalarTypeDefs.set(params.name, this);
    } else {
      scalarTypeDefs.set(params.name, this);
    }
  }
}
