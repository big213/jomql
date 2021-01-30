import type { InputFieldDefinition } from "../types";

export class JomqlInputFieldType {
  definition;
  constructor(params: InputFieldDefinition) {
    this.definition = params;
  }
}
