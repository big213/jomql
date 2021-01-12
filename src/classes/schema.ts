import {
  Schema,
  isScalarDefinition,
  RootResolverObject,
  TypeDefinition,
  isInputTypeDefinition,
  ArgDefinition,
} from "..";

function isNestedValue(
  ele: tsTypeFieldFinalValue | tsTypeFields
): ele is tsTypeFields {
  return ele instanceof Map;
}

type tsTypeFields = Map<string, tsTypeFieldFinalValue | tsTypeFields>;

type tsTypeFieldFinalValue = {
  value: string;
  isArray: boolean;
  isNullable: boolean;
  isOptional: boolean;
  description?: string;
};

type tsRootType = {
  value: tsTypeFields | tsTypeFieldFinalValue;
  description?: string;
};

export class TsSchemaGenerator {
  schema: Schema;
  scaffoldStr: string = `// Query builder
const queryResult = executeJomql({
  // Start typing here to get hints
  
});

export function executeJomql<Key extends keyof Root>(
  query: GetQuery<Key>
): GetResponse<Key> {
  let data: any;
  return data;
}

// scaffolding
export type GetQuery<K extends keyof Root> = Record<
  K,
  Argize<Queryize<Root[K]["Query"]>, Root[K]["Args"]>
>;

export type GetResponse<K extends keyof Root> = Omit<Root[K]["Response"], args>;

type Primitive = string | number | boolean | undefined | null;

type args = "__args";

type ElementType<T extends any[]> = T[number];

type Queryize<T> = T extends never
  ? never
  : T extends Primitive
  ? true
  : T extends any[]
  ? Queryize<ElementType<T>>
  : args extends keyof T
  ? Omit<
      {
        [P in keyof T]?: Queryize<T[P]>;
      },
      args
    > &
      (undefined extends T[args] ? { __args?: T[args] } : { __args: T[args] })
  : {
      [P in keyof T]?: Queryize<T[P]>;
    };

type Argize<T, Args> = Args extends undefined
  ? Omit<T, args>
  : Omit<T, args> & { __args: Args };\n\n`;
  typeDocumentRoot: Map<string, tsRootType> = new Map();
  scalarTsTypeFields: tsTypeFields = new Map();
  inputTypeTsTypeFields: tsTypeFields = new Map();
  deferredTypeFields: Set<string> = new Set();

  constructor(schema: Schema) {
    this.schema = schema;
  }

  buildSchema() {
    // all scalars
    Object.entries(this.schema.scalars).forEach(([field, fieldDef]) => {
      if (isScalarDefinition(fieldDef)) {
        this.scalarTsTypeFields.set(fieldDef.name, {
          value: fieldDef.types.join("|"),
          isArray: false,
          isNullable: false,
          isOptional: false,
          description: fieldDef.description,
        });
      }
    });

    this.typeDocumentRoot.set("Scalars", {
      value: this.scalarTsTypeFields,
      description: "All scalar values",
    });

    this.typeDocumentRoot.set("InputType", {
      value: this.inputTypeTsTypeFields,
      description: "All input types",
    });

    // add main types
    this.schema.typeDefs.forEach((typeDef, typeDefKey) => {
      const capitalizedTypeDefKey = capitalizeString(typeDefKey);
      const mainTypeFields = this.processTypeDefinition(typeDef);

      this.typeDocumentRoot.set(capitalizedTypeDefKey, {
        value: mainTypeFields,
        description: typeDef.description,
      });

      // check if this type was on any deferred lists. if so, remove.
      if (this.deferredTypeFields.has(capitalizedTypeDefKey)) {
        this.deferredTypeFields.delete(capitalizedTypeDefKey);
      }
    });

    // add root resolvers -- must be added AFTER types
    const rootTypeFields: tsTypeFields = new Map();

    this.typeDocumentRoot.set("Root", {
      value: rootTypeFields,
      description: "Root type",
    });

    this.schema.rootResolvers.forEach((rootResolver, key) => {
      const rootObject: tsTypeFields = new Map();
      const type = rootResolver.type;
      let typename;
      if (isScalarDefinition(type)) {
        // if it is a scalarDefinition, look up in scalar Definition table

        // if not exists, add it
        if (!this.scalarTsTypeFields.has(type.name)) {
          this.scalarTsTypeFields.set(type.name, {
            value: type.types.join("|"),
            isArray: !!rootResolver.isArray,
            isNullable: rootResolver.allowNull,
            isOptional: false,
            description: rootResolver.description,
          });
        }

        typename = `Scalars['${type.name}']`;
      } else {
        typename = capitalizeString(type);

        // if typename is not defined in the typeDocumentRoot, it is an unknown type. add it to the list and try to process later.
        if (!this.typeDocumentRoot.has(typename)) {
          this.deferredTypeFields.add(typename);
        }
      }

      // parse the argDefinitions
      const argReference = this.processArgDefinition(rootResolver.args, key);

      rootObject.set("Query", {
        value: typename,
        isArray: false,
        isNullable: false,
        isOptional: false,
      });

      rootObject.set("Response", {
        value: typename,
        isArray: false,
        isNullable: false,
        isOptional: false,
      });

      rootObject.set("Args", argReference);

      rootTypeFields.set(key, rootObject);
    });

    // process deferred fields
    // no longer should be any
    /*
    this.deferredTypeFields.forEach((ele) => {
      let fieldAdded = false;

      if (fieldAdded) {
        this.deferredTypeFields.delete(ele);
      }
    });
    */

    // if any deferred fields left, give a warning
    if (this.deferredTypeFields.size > 0) {
      console.log(
        "Warning: the schema file might not be complete due to some missing types"
      );
      console.log(this.deferredTypeFields);
    }
  }

  processTypeDefinition(typeDef: TypeDefinition) {
    const mainTypeFields: tsTypeFields = new Map();
    Object.entries(typeDef.fields).forEach(([field, fieldDef]) => {
      const type = fieldDef.type;
      let typename;

      // if field is hidden, set the typename to never
      if (fieldDef.hidden) {
        typename = "never";
      } else if (isScalarDefinition(type)) {
        // if it is a scalarDefinition, look up in scalar Definition table

        // if not exists, add it
        if (!this.scalarTsTypeFields.has(type.name)) {
          this.scalarTsTypeFields.set(type.name, {
            value: type.types.join("|"),
            isArray: !!fieldDef.isArray,
            isNullable: false,
            isOptional: false,
            description: type.description,
          });
        }

        typename = `Scalars['${type.name}']`;
      } else {
        typename = capitalizeString(type);

        // if typename is not defined in the typeDocumentRoot, it is an unknown type. add it to the list.
        if (!this.typeDocumentRoot.has(typename)) {
          this.deferredTypeFields.add(typename);
        }
      }

      mainTypeFields.set(field, {
        value: typename,
        isArray: !!fieldDef.isArray,
        isNullable: fieldDef.allowNull,
        isOptional: false,
        description: fieldDef.description,
      });
    });

    return mainTypeFields;
  }

  processArgDefinition(
    argDefinition: ArgDefinition | undefined,
    rootResolverName?: string
  ): tsTypeFieldFinalValue {
    let inputDefName;
    if (argDefinition) {
      const argDefType = argDefinition.type;

      const inputTypeTypeFields: tsTypeFields = new Map();
      if (isInputTypeDefinition(argDefType)) {
        Object.entries(argDefType.fields).forEach(([key, argDef]) => {
          const finalValue = this.processArgDefinition(argDef);
          inputTypeTypeFields.set(key, finalValue);
        });
        const argDefName = argDefType.name ?? rootResolverName;

        if (!argDefName) throw new Error("At least 1 ArgDef is missing name");

        // add to type InputType if not exists
        if (!this.inputTypeTsTypeFields.has(argDefName)) {
          this.inputTypeTsTypeFields.set(argDefName, inputTypeTypeFields);
        }

        // update the argTypename
        inputDefName = `InputType['${argDefName}']`;
      } else if (isScalarDefinition(argDefType)) {
        // if it is a scalarDefinition, look up in input Definition table

        // if not exists, add it
        if (!this.scalarTsTypeFields.has(argDefType.name)) {
          this.scalarTsTypeFields.set(argDefType.name, {
            value: argDefType.types.join("|"),
            isArray: false,
            isNullable: false,
            isOptional: false,
            description: argDefType.description,
          });
        }

        inputDefName = `Scalars['${argDefType.name}']`;
      } else {
        // string field, must refer to an InputType
        inputDefName = `InputType['${argDefType}']`;
      }

      // if argName is a getX rootResolver and X is a known type, add as arg field on type X
      if (rootResolverName) {
        const keyParts = rootResolverName.split(/^get/);
        if (
          keyParts[0] === "" &&
          this.schema.typeDefs.has(lowercaseString(keyParts[1]))
        ) {
          const tsTypeField = this.typeDocumentRoot.get(keyParts[1]);
          if (tsTypeField && isNestedValue(tsTypeField.value)) {
            tsTypeField.value.set("__args", {
              value: `Root["${rootResolverName}"]["Args"]`,
              isArray: false,
              isNullable: false,
              isOptional: false,
              description: `Args for ${keyParts[1]}`,
            });
          }
        }
      }
    }

    return {
      value: inputDefName ?? "undefined",
      isArray: argDefinition?.isArray ?? false,
      isNullable: false,
      isOptional: !argDefinition?.required ?? false,
      description: undefined,
    };
  }

  outputSchema(htmlMode = false) {
    // build final TS document
    let typesStr: string = "";

    this.typeDocumentRoot.forEach((tsRootTypeValue, typename) => {
      // has description? if so, add jsdoc
      if (tsRootTypeValue.description)
        typesStr += `/**${tsRootTypeValue.description}*/`;
      typesStr +=
        `export type ${typename}=` +
        (isNestedValue(tsRootTypeValue.value)
          ? this.buildTsDocument(tsRootTypeValue.value)
          : `(${
              (tsRootTypeValue.value.value === ""
                ? "undefined"
                : tsRootTypeValue.value.value) +
              (tsRootTypeValue.value.isNullable ? "|null" : "") +
              ")" +
              (tsRootTypeValue.value.isArray ? "[]" : "")
            }`) +
        `\n`;
    });

    const finalStr = this.scaffoldStr + typesStr;
    return htmlMode ? `<pre>${finalStr}</pre>` : finalStr;
  }

  buildTsDocument(tsTypeField: tsTypeFields) {
    let str = "{";
    tsTypeField.forEach((value, key) => {
      if (isNestedValue(value)) {
        // nested tsTypeField
        str += `${key}:${this.buildTsDocument(value)};`;
      } else {
        // string value
        // has description? if so, add jsdoc
        if (value.description) str += `/**${value.description}*/`;
        str += `${key + (value.isOptional ? "?" : "")}:(${
          (value.value === "" ? "undefined" : value.value) +
          (value.isNullable ? "|null" : "") +
          ")" +
          (value.isArray ? "[]" : "")
        };`;
      }
    });
    str += "}";
    return str;
  }
}

function capitalizeString(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function lowercaseString(str: string) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function sanitizeType(val: any) {
  if (Array.isArray(val))
    return JSON.stringify(val.map((ele) => capitalizeString(ele)));
  else return capitalizeString(val);
}
