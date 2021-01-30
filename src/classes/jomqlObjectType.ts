import type { ObjectTypeDefinition } from "../types";
import { objectTypeDefs } from "..";
import { JomqlInitializationError } from "./error/jomqlInitializationError";

export class JomqlObjectType {
  definition;
  constructor(params: ObjectTypeDefinition, allowDuplicate = false) {
    this.definition = params;

    // register this typeDef
    if (objectTypeDefs.has(params.name)) {
      if (!allowDuplicate)
        throw new JomqlInitializationError({
          message: `JomqlObjectType already registered for '${params.name}'`,
        });
    } else {
      objectTypeDefs.set(params.name, this);
    }
  }
}
