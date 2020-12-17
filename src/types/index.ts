import type { ModelAttributeColumnOptions } from "sequelize";

export type MysqlEnv = {
  readonly database: string;
  readonly user: string;
  readonly password: string;
  readonly socketpath?: string;
  readonly host?: string;
  readonly port?: string;
};

export type Params = {
  readonly mysqlEnv: MysqlEnv;
  readonly debug?: Boolean;
  readonly allowedOrigins?: Array<string>;
  readonly lookupValue?: any;
  readonly jomqlPath?: string;
  readonly allowSync?: Boolean;
};

export type RootResolverObject = {
  method: string;
  route: string;
  type: string | string[];
  args?: object;
  resolver: ResolverFunction;
};

export type RootResolver = {
  query: {
    [x: string]: RootResolverObject;
  };
  mutation: {
    [x: string]: RootResolverObject;
  };
  subscription: {
    [x: string]: RootResolverObject;
  };
};

export type TypeDef = {
  [x: string]: TypeDefObject;
};

export type TypeDefObject = {
  type: string;
  isArray?: boolean;
  allowNull?: boolean;
  mysqlOptions?: TypeDefSqlOptions;
  addable?: boolean;
  updateable?: boolean;
  hidden?: boolean;
  transform?: {
    setter?: Function;
    getter?: Function;
  };
  args?: object;
  dataloader?: any;
  resolver?: ResolverFunction;
  deleter?: Function;
  setter?: Function;
  updater?: Function;
};

export type TypeDefSqlOptions = ModelAttributeColumnOptions & {
  joinInfo?: {
    type: string;
    foreignKey?: string;
  };
  getter?: Function;
  joinHidden?: boolean;
};

export type Schema = {
  rootResolvers: RootResolver;
  typeDefs: Map<string, TypeDef>;
  enums: {
    [x: string]: { [s: number]: string };
  };
};

export type ResolverFunction = (
  req: any,
  args: any,
  query?: any,
  typename?: string,
  currentObject?: any,
  parentObject?: any
) => any;

export type JomqlResolverTree = {
  validatedSqlQuery: SqlQuerySelectObject[];
  validatedResolverQuery: JomqlResolverObject;
};

export type JomqlResolverObject = {
  [x: string]: {
    resolver?: ResolverFunction;
    dataloader?: ResolverFunction;
    query?: any;
    getter?: Function;
    type: string;
    nested?: JomqlResolverObject;
  };
};

export type SqlWhereObject = {
  connective?: string;
  fields: (SqlWhereObject | SqlWhereFieldObject)[];
};

export type SqlJoinFieldObject = {
  table: string;
  field: string;
  foreignField: string;
};

export type SqlSelectFieldObject = SqlFieldObject & {
  field: string;
};

export type SqlWhereFieldObject = SqlFieldObject & {
  field: string;
  value: any;
  operator?: string;
};

export type SqlSortFieldObject = SqlFieldObject & {
  field: string;
  desc?: boolean;
};

export type SqlGroupFieldObject = SqlFieldObject & {
  field: string;
};

export type SqlFieldObject = {
  joinFields?: SqlJoinFieldObject[];
};

export type SqlQueryObject = SqlParams & {
  select: SqlQuerySelectObject[];
  from: string;
};

export type SqlQuerySelectObject = {
  field: string;
  as?: string;
  getter?: Function;
};

export type SqlParams = {
  rawSelect?: SqlQuerySelectObject[];
  where?: SqlWhereObject;
  limit?: number;
  groupBy?: SqlGroupFieldObject[];
  orderBy?: SqlSortFieldObject[];
};

export type JomqlQuery = {
  [y: string]: any;
  __args?: {
    [x: string]: any;
  };
};

export type JomqlOutput = {
  [x: string]: any;
};
