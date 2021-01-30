import type { InputTypeDefinition } from "../types";
import { inputTypeDefs } from "..";
import { JomqlInitializationError } from "./error/jomqlInitializationError";

export class JomqlInputType {
  definition;
  constructor(params: InputTypeDefinition, allowDuplicate = false) {
    this.definition = params;

    // register this typeDef
    if (inputTypeDefs.has(params.name)) {
      if (!allowDuplicate)
        throw new JomqlInitializationError({
          message: `JomqlInputType already registered for '${params.name}'`,
        });
    } else {
      inputTypeDefs.set(params.name, this);
    }
  }
}
