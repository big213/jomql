import type { RootResolverDefinition } from "../types";
import { rootResolvers } from "..";
import { JomqlInitializationError } from "./error/jomqlInitializationError";

export class JomqlRootResolverType {
  definition;
  constructor(params: RootResolverDefinition) {
    this.definition = params;

    // register this rootResolver
    if (rootResolvers.has(params.name)) {
      throw new JomqlInitializationError({
        message: `JomqlRootResolverType already registered for '${params.name}'`,
      });
    } else {
      rootResolvers.set(params.name, this);
    }
  }
}
