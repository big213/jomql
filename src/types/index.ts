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
  type: string | string[];
  allowNull?: boolean;
  mysqlOptions?: object;
  addable?: boolean;
  updateable?: boolean;
  filterable?: boolean;
  hidden?: boolean;
  transform?: {
    setter?: Function;
    getter?: Function;
  };
  resolver?: ResolverFunction;
};

export type Schema = {
  rootResolvers: RootResolver;
  typeDefs: {
    [x: string]: TypeDef;
  };
  enums: {
    [x: string]: { [s: number]: string };
  };
};

export type ResolverFunction = (
  req: any,
  args: any,
  query?: any,
  typename?: string,
  currentObject?: any
) => any;
