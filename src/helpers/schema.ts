import { Schema, isScalarDefinition, RootResolverObject } from "../types";

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
};

export function generateTsSchema(schema: Schema) {
  const scaffoldStr = `
// scaffolding
export type Primitive = string | number | boolean | undefined | null;

export type args = "__args";

type ElementType<T extends any[]> = T[number];

type PaginatorInfo = {
  total: number | null;
  count: number;
  startCursor: string;
  endCursor: string;
};

type Edge<T> = {
  node: T;
  cursor: string;
};

export type Queryize<T> = {
  [P in keyof T]?: T[P] extends Primitive
    ? true
    : P extends args
    ? T[P]
    : T[P] extends any[] // strips the array from any array types
    ? Queryize<ElementType<T[P]>>
    : Queryize<T[P]>;
};

export type Argize<T, Args> = Args extends undefined
  ? T
  : Omit<T, args> & { __args?: Args };

export type BaseScalars = {
  string: string;
  number: number;
  boolean: boolean;
  unknown: unknown;
};

export type FilterOperators =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "in"
  | "nin"
  | "regex"
  | "like";

type Scalars = BaseScalars & AddedScalars;\n`;

  const tsJson: Map<string, tsTypeFields> = new Map();

  // add scalars
  const scalarTsTypeFields: tsTypeFields = new Map();

  Object.entries(schema.scalars).forEach(([field, fieldDef]) => {
    if (isScalarDefinition(fieldDef)) {
      scalarTsTypeFields.set(fieldDef.name, {
        value: fieldDef.types.join("|"),
        isArray: false,
        isNullable: false,
        isOptional: false,
      });
    }
  });

  tsJson.set("AddedScalars", scalarTsTypeFields);

  // add main types
  schema.typeDefs.forEach((typeDef, typeDefKey) => {
    const tsTypeFields: tsTypeFields = new Map();

    Object.entries(typeDef).forEach(([field, fieldDef]) => {
      const type = fieldDef.type;
      let typename;
      if (isScalarDefinition(type)) {
        // if it is a scalarDefinition, look up in scalar Definition table

        // if not exists, add it
        if (!scalarTsTypeFields.has(type.name)) {
          scalarTsTypeFields.set(type.name, {
            value: type.types.join("|"),
            isArray: !!fieldDef.isArray,
            isNullable: false,
            isOptional: false,
          });
        }

        typename = `Scalars['${type.name}']`;
      } else {
        typename = capitalizeString(type);
      }

      // for a XPaginator typeDefKey, the Edge should be named XEdge
      // we will simplify that using a generic type to save space
      if (typeDefKey.match(/Paginator$/) && typename.match(/Edge$/)) {
        typename = `Edge<${typename.replace(/Edge$/, "")}>`;
      }

      tsTypeFields.set(field, {
        value: typename,
        isArray: !!fieldDef.isArray,
        isNullable: fieldDef.allowNull,
        isOptional: false,
      });
    });

    tsJson.set(capitalizeString(typeDefKey), tsTypeFields);
  });

  // add root resolvers -- must be added AFTER types
  const rootTypeFields: tsTypeFields = new Map();

  tsJson.set("Root", rootTypeFields);

  // aggregate all root resolvers
  const allRootResolversMap: Map<string, RootResolverObject> = new Map();

  Object.values(schema.rootResolvers).forEach((rootResolver) => {
    for (const key in rootResolver) {
      allRootResolversMap.set(key, rootResolver[key]);
    }
  });

  allRootResolversMap.forEach((rootResolver, key) => {
    const rootObject: tsTypeFields = new Map();
    const type = rootResolver.type;
    let typename;
    if (isScalarDefinition(type)) {
      // if it is a scalarDefinition, look up in scalar Definition table

      // if not exists, add it
      if (!scalarTsTypeFields.has(type.name)) {
        scalarTsTypeFields.set(type.name, {
          value: type.types.join("|"),
          isArray: !!rootResolver.isArray,
          isNullable: rootResolver.allowNull,
          isOptional: false,
        });
      }

      typename = `Scalars['${type.name}']`;
    } else {
      typename = capitalizeString(type);
    }

    // parse the argDefinitions
    const argsTypeFields: tsTypeFields = new Map();
    if (rootResolver.args) {
      Object.entries(rootResolver.args).forEach(([argName, argDef]) => {
        const argType = argDef.type;
        let argTypename;
        if (isScalarDefinition(argType)) {
          // if it is a scalarDefinition, look up in scalar Definition table

          // if not exists, add it
          if (!scalarTsTypeFields.has(argType.name)) {
            scalarTsTypeFields.set(argType.name, {
              value: argType.types.join("|"),
              isArray: !!rootResolver.isArray,
              isNullable: rootResolver.allowNull,
              isOptional: false,
            });
          }

          argTypename = `Scalars['${argType.name}']`;
        } else {
          argTypename = capitalizeString(argType);
        }

        argsTypeFields.set(argName, {
          value: argTypename,
          isArray: !!argDef.isArray,
          isNullable: false,
          isOptional: !argDef.required,
        });
      });
    }

    if (argsTypeFields.size) {
      // if it is a getX rootResolver and X is a known type, add as arg field on type X
      const keyParts = key.split(/^get/);
      if (
        keyParts[0] === "" &&
        schema.typeDefs.has(lowercaseString(keyParts[1]))
      ) {
        const tsTypeField = tsJson.get(keyParts[1]);
        if (tsTypeField) {
          tsTypeField.set("__args", {
            value: `Root["${key}"]["Args"]`,
            isArray: false,
            isNullable: false,
            isOptional: false,
          });
        }
      }
    }

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

    rootObject.set(
      "Args",
      argsTypeFields.size
        ? argsTypeFields
        : {
            value: "undefined",
            isArray: false,
            isNullable: false,
            isOptional: false,
          }
    );

    rootTypeFields.set(key, rootObject);
  });

  // build main types
  let typesStr: string = "";

  tsJson.forEach((tsTypeField, typename) => {
    typesStr +=
      `export type ${typename}=` + buildTsFromJson(tsTypeField) + `\n`;
  });

  return scaffoldStr + typesStr;
}

function buildTsFromJson(tsTypeField: tsTypeFields) {
  let str = "{";
  tsTypeField.forEach((value, key) => {
    if (isNestedValue(value)) {
      // nested tsTypeField
      str += `${key}:${buildTsFromJson(value)};`;
    } else {
      // string value
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
