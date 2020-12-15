import { getTypeDefs } from "../..";
import * as mysql from "../../utils/mysql2";
import type {
  SqlQueryObject,
  SqlWhereObject,
  SqlJoinFieldObject,
  SqlSelectFieldObject,
  SqlGroupFieldObject,
  SqlSortFieldObject,
  SqlWhereFieldObject,
} from "../../types";

import errorHelper from "../tier0/error";

export type JoinsMap = {
  [x: string]: string[];
};

export type AssemblyFunction = (
  tableName: string,
  tableAlias: string,
  fieldname: string,
  fieldObject: any,
  fieldIndex: number
) => string;

export function fetchTableRows(sqlQuery: SqlQueryObject) {
  let whereStatement = "";
  let orderStatement = "";
  let limitStatement = "";
  let groupByStatement = "";
  let joinStatement = "";

  const params = {};

  const previousJoins: JoinsMap = {};

  // handle select statements
  const selectResults = processSelectArray(
    sqlQuery.from,
    sqlQuery.select.concat(sqlQuery.rawSelect ?? []),
    previousJoins
  );

  if (selectResults.statements.length < 1) throw new Error("Invalid SQL");

  joinStatement += selectResults.joinStatement;

  const selectStatement = selectResults.statements.join(", ");

  // handle where statements
  if (sqlQuery.where) {
    const whereResults = processWhereObject(
      sqlQuery.from,
      sqlQuery.where,
      previousJoins,
      params
    );

    whereStatement = whereResults.whereStatement;
    joinStatement += whereResults.joinStatement;
  }

  if (!whereStatement) {
    whereStatement = "1";
  }

  //handle orderBy statements
  //field MUST be pre-validated
  if (sqlQuery.orderBy) {
    const orderResults = processSortArray(
      sqlQuery.from,
      sqlQuery.orderBy,
      previousJoins
    );

    orderStatement += orderResults.statements.join(", ");
    joinStatement += orderResults.joinStatement;
  }

  //handle limit statement
  if (sqlQuery.limit) {
    limitStatement += " LIMIT " + sqlQuery.limit ?? 0;
  }

  //handle limit/offset statements
  if (sqlQuery.groupBy) {
    const groupResults = processGroupArray(
      sqlQuery.from,
      sqlQuery.groupBy,
      previousJoins
    );

    groupByStatement += groupResults.statements.join(", ");
    joinStatement += groupResults.joinStatement;
  }

  /*
  if(jqlQuery.offset) {
    limitStatement += " OFFSET " + parseInt(jqlQuery.offset) || 0;
  }
  */

  const sqlQueryString =
    "SELECT " +
    selectStatement +
    " FROM " +
    sqlQuery.from +
    joinStatement +
    " WHERE " +
    whereStatement +
    (groupByStatement ? " GROUP BY " + groupByStatement : "") +
    (orderStatement ? " ORDER BY " + orderStatement : "") +
    limitStatement;

  return mysql.executeDBQuery(sqlQueryString, params);
}

export async function countTableRows(
  table: string,
  whereObject: SqlWhereObject
) {
  let whereStatement = "";
  let joinStatement = "";
  const previousJoins: JoinsMap = {};
  const params = {};

  const selectStatement = "count(*) AS count";

  //handle where statements
  const whereResults = processWhereObject(
    table,
    whereObject,
    previousJoins,
    params
  );

  whereStatement += whereResults.whereStatement;
  joinStatement += whereResults.joinStatement;

  if (!whereStatement) {
    whereStatement = "1";
  }

  const sqlQuery =
    "SELECT " +
    selectStatement +
    " FROM " +
    table +
    joinStatement +
    " WHERE " +
    whereStatement;

  const results = await mysql.executeDBQuery(sqlQuery, params);

  return results[0].count;
}

export function insertTableRow(
  table: string,
  setFields,
  rawSetFields = {},
  ignore = false
) {
  let setStatement = "";
  const params = {};

  for (const fieldname in setFields) {
    setStatement += fieldname + " = :" + fieldname + ", ";
    params[fieldname] = setFields[fieldname];
  }

  //raw fields MUST be sanitized or internally added
  for (const fieldname in rawSetFields) {
    setStatement += fieldname + " = " + rawSetFields[fieldname] + ", ";
  }

  if (setStatement) {
    //remove trailing comma
    setStatement = setStatement.slice(0, -2);
  } else {
    throw errorHelper.invalidSqlError();
  }

  const query =
    "INSERT " +
    (ignore ? "IGNORE " : "") +
    "INTO " +
    table +
    " SET " +
    setStatement;

  return mysql.executeDBQuery(query, params);
}

export function updateTableRow(
  table: string,
  setFields,
  rawSetFields = {},
  whereObject: SqlWhereObject
) {
  let setStatement = "";
  let whereStatement = "";
  let joinStatement = "";
  const previousJoins: JoinsMap = {};
  const params = {};

  //handle set fields
  for (const fieldname in setFields) {
    setStatement += fieldname + " = :" + fieldname + ", ";
    params[fieldname] = setFields[fieldname];
  }

  //raw fields MUST be sanitized or internally added
  for (const fieldname in rawSetFields) {
    setStatement += fieldname + " = " + rawSetFields[fieldname] + ", ";
  }

  if (setStatement) {
    //remove trailing comma
    setStatement = setStatement.slice(0, -2);
  } else {
    throw errorHelper.invalidSqlError();
  }

  //handle where statements
  if (whereObject) {
    const whereResults = processWhereObject(
      table,
      whereObject,
      previousJoins,
      params
    );

    whereStatement += whereResults.whereStatement;
    joinStatement += whereResults.joinStatement;
  }

  if (!whereStatement) {
    throw errorHelper.invalidSqlError();
  }

  //combine statements
  const query =
    "UPDATE " +
    table +
    joinStatement +
    " SET " +
    setStatement +
    " WHERE " +
    whereStatement;

  return mysql.executeDBQuery(query, params);
}

export function removeTableRow(table: string, whereObject: SqlWhereObject) {
  let whereStatement = "";
  let joinStatement = "";
  const previousJoins: JoinsMap = {};
  const params = {};

  //handle where statements
  if (whereObject) {
    const whereResults = processWhereObject(
      table,
      whereObject,
      previousJoins,
      params
    );

    whereStatement += whereResults.whereStatement;
    joinStatement += whereResults.joinStatement;
  }

  if (!whereStatement) {
    throw errorHelper.invalidSqlError();
  }

  const query =
    "DELETE FROM " + table + joinStatement + " WHERE " + whereStatement;

  return mysql.executeDBQuery(query, params);
}

export function processSelectArray(
  table: string,
  selectFieldsArray: SqlSelectFieldObject[],
  previousJoins: JoinsMap
) {
  return processJoins(
    table,
    selectFieldsArray,
    previousJoins,
    (tableName, tableAlias, fieldname, fieldObject, fieldIndex) => {
      const currentTypeDef = getTypeDefs().get(tableName);
      if (!currentTypeDef) throw new Error("Invalid typeDef for: " + tableName);
      if (!(fieldname in currentTypeDef))
        throw new Error(
          "Field: " + fieldname + " does not exist in table: " + tableName
        );

      const getter = currentTypeDef[fieldname].mysqlOptions?.getter;

      return (
        (getter
          ? getter(tableAlias + "." + fieldname)
          : tableAlias + "." + fieldname) +
        ' AS "' +
        (fieldObject.as ?? fieldObject.field) +
        '"'
      );
    }
  );
}

function isSqlWhereObject(
  obj: SqlWhereFieldObject | SqlWhereObject
): obj is SqlWhereObject {
  return (obj as SqlWhereObject).fields !== undefined;
}

export function processWhereObject(
  table: string,
  whereObject: SqlWhereObject,
  previousJoins: JoinsMap,
  params,
  subIndexString = ""
) {
  const statements: string[] = [];
  let whereStatement = "";
  let joinStatement = "";

  const connective = whereObject.connective ?? "AND";

  whereObject.fields.forEach((whereSubObject, subIndex) => {
    // separate the SqlWhereFieldObject from SqlWhereObject
    const whereFieldObjects: SqlWhereFieldObject[] = [];
    const whereObjects: SqlWhereObject[] = [];

    if (isSqlWhereObject(whereSubObject)) {
      whereObjects.push(whereSubObject);
    } else {
      whereFieldObjects.push(whereSubObject);
    }

    // process SqlWhereFieldObjects, if any
    const results = processJoins(
      table,
      whereFieldObjects,
      previousJoins,
      (tableName, tableAlias, fieldname, fieldObject, fieldIndex) => {
        // else, must be SqlWhereFieldObject
        const operator = fieldObject.operator ?? "=";
        const placeholder = fieldname + subIndexString + "_" + subIndex;

        const currentTypeDef = getTypeDefs().get(tableName);
        if (!currentTypeDef)
          throw new Error("Invalid typeDef for: " + tableName);
        if (!(fieldname in currentTypeDef))
          throw new Error(
            "Field: " + fieldname + " does not exist in table: " + tableName
          );

        const getter = currentTypeDef[fieldname].mysqlOptions?.getter;

        let whereSubstatement = getter
          ? getter(tableAlias + "." + fieldname)
          : tableAlias + "." + fieldname;

        //value must be array with at least 2 elements
        if (operator === "BETWEEN") {
          whereSubstatement +=
            " BETWEEN :" + fieldname + "0 AND :" + fieldname + "1";

          params[fieldname + "0"] = fieldObject.value[0];
          params[fieldname + "1"] = fieldObject.value[1];
        } else {
          if (Array.isArray(fieldObject.value)) {
            whereSubstatement += " IN (:" + placeholder + ")";
            params[placeholder] = fieldObject.value;
          } else if (fieldObject.value === null) {
            //if fieldvalue.value === null, change the format accordingly
            if (operator === "!=") {
              whereSubstatement += " IS NOT NULL";
            } else if (operator === "=") {
              whereSubstatement += " IS NULL";
            } else {
              throw new Error("Invalid operator for null");
            }
          } else {
            whereSubstatement += " " + operator + " :" + placeholder;
            params[placeholder] = fieldObject.value;
          }
        }

        return whereSubstatement;
      }
    );

    if (results.statements.length > 0) {
      statements.push(results.statements.join(" " + connective + " "));
    }

    joinStatement += results.joinStatement;

    // process SqlWhereObjects
    whereObjects.forEach((ele, whereObjectIndex) => {
      const res = processWhereObject(
        table,
        ele,
        previousJoins,
        params,
        subIndexString + "_" + whereObjectIndex
      );
      statements.push("(" + res.whereStatement + ")");
      joinStatement += res.joinStatement;
    });
  });

  if (statements.length > 0) {
    whereStatement = statements.join(" " + connective + " ");
  }

  return {
    // statements,
    whereStatement,
    joinStatement,
  };
}

export function processSortArray(
  table: string,
  sortFieldsArray: SqlSortFieldObject[],
  previousJoins: JoinsMap
) {
  return processJoins(
    table,
    sortFieldsArray,
    previousJoins,
    (tableName, tableAlias, fieldname, fieldObject, fieldIndex) =>
      tableAlias + "." + fieldname + " " + (fieldObject.desc ? "DESC" : "ASC")
  );
}

export function processGroupArray(
  table: string,
  groupFieldsArray: SqlGroupFieldObject[],
  previousJoins: JoinsMap
) {
  return processJoins(
    table,
    groupFieldsArray,
    previousJoins,
    (tableName, tableAlias, fieldname, fieldObject, fieldIndex) =>
      tableName + "." + fieldname
  );
}

export function processJoins(
  table: string,
  fieldsArray: { [x: string]: any; joinFields?: SqlJoinFieldObject[] }[],
  previousJoins: JoinsMap,
  assemblyFn: AssemblyFunction
) {
  const statements: string[] = [];
  let joinStatement = "";

  fieldsArray.forEach((fieldObject, fieldIndex) => {
    const fieldPath = fieldObject.field.split(".");
    let currentTypeDef = getTypeDefs().get(table);
    let currentTable = table;
    let currentType = table;

    if (!currentTypeDef)
      throw new Error("TypeDef: " + currentTable + " does not exist");

    let joinTableAlias, fieldname;

    const joinArray: {
      joinTableName?: string;
      field: string;
      foreignField: string;
    }[] = [];

    //if this exists, they must be processed first before processing the fieldPath
    if (Array.isArray(fieldObject.joinFields)) {
      fieldObject.joinFields.forEach((joinFieldObject, joinFieldIndex) => {
        joinArray.push({
          joinTableName: joinFieldObject.table,
          field: joinFieldObject.field,
          foreignField: joinFieldObject.foreignField,
        });
      });
    }

    //process the "normal" fields
    fieldPath.forEach((field, joinFieldIndex) => {
      // check for valid field in the typDef
      if (!(field in currentTypeDef!))
        throw new Error(
          "Field: " + field + " does not exist in Table: " + currentTable
        );
      joinArray.push({
        field: field,
        foreignField:
          currentTypeDef![field].mysqlOptions?.joinInfo?.foreignKey ?? "id",
      });
    });

    const cumulativeJoinFields: string[] = [];
    joinArray.forEach((ele, eleIndex) => {
      cumulativeJoinFields.push(ele.field);
      const cumulativeJoinFieldChain = cumulativeJoinFields.join(".");
      //if there's no next field, no more joins
      if (joinArray[eleIndex + 1]) {
        // check for valid field in the typDef
        if (!(ele.field in currentTypeDef!))
          throw new Error(
            "Field: " + ele.field + " does not exist in Table: " + currentTable
          );

        //join with this type
        const joinTableName =
          ele.joinTableName ??
          currentTypeDef![ele.field].mysqlOptions?.joinInfo?.type;

        //if it requires a join, check if it was joined previously
        if (joinTableName) {
          if (!(joinTableName in previousJoins)) {
            previousJoins[joinTableName] = [];
          }

          // always use a new join
          let newJoin = false;

          let index = previousJoins[joinTableName].lastIndexOf(
            cumulativeJoinFieldChain
          );

          //if index not exists, join the table and get the index.
          if (index === -1) {
            previousJoins[joinTableName].push(cumulativeJoinFieldChain);
            index = previousJoins[joinTableName].lastIndexOf(
              cumulativeJoinFieldChain
            );
            newJoin = true;
          }

          //always set the alias.
          joinTableAlias = joinTableName + index;

          if (newJoin) {
            //assemble join statement, if required
            joinStatement +=
              " LEFT JOIN " +
              joinTableName +
              " " +
              joinTableAlias +
              " ON " +
              currentTable +
              "." +
              ele.field +
              " = " +
              joinTableAlias +
              "." +
              ele.foreignField;
          }

          //shift the typeDef
          currentTypeDef = getTypeDefs().get(joinTableName);
          currentTable = joinTableAlias;
          currentType = joinTableName;
        }
      } else {
        //no more fields, set the fieldname
        fieldname = ele.field;
      }
    });

    statements.push(
      assemblyFn(currentType, currentTable, fieldname, fieldObject, fieldIndex)
    );
  });

  return {
    statements,
    joinStatement,
  };
}

export const executeDBQuery = mysql.executeDBQuery;

export const getMysqlRaw = mysql.getMysqlRaw;
