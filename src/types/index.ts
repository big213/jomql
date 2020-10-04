
export type MysqlEnv = {
  readonly database: string,
  readonly user: string,
  readonly password: string,
  readonly socketpath?: string,
  readonly host?: string,
  readonly port?: string,
};


export type PusherEnv = {
  readonly app_id: string,
  readonly key: string,
  readonly secret: string,
  readonly cluster: string,
};

export type Params = {
  readonly mysqlEnv: MysqlEnv;
  readonly pusherEnv?: PusherEnv;
  readonly debug?: Boolean;
  readonly allowedOrigins?: Array<string>;
  readonly lookupValue?: any;
};