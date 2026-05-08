declare module 'pg' {
  export type PoolConfig = {
    connectionString?: string;
    max?: number;
    min?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  };

  export type QueryResult<Row = Record<string, unknown>> = {
    rows: Row[];
  };

  export type Notification = {
    channel: string;
    payload?: string;
  };

  export class Pool {
    constructor(config?: PoolConfig);
    query<Row = Record<string, unknown>>(
      queryText: string,
      values?: unknown[],
    ): Promise<QueryResult<Row>>;
    end(): Promise<void>;
  }

  export class Client {
    constructor(config?: PoolConfig);
    connect(): Promise<void>;
    query<Row = Record<string, unknown>>(
      queryText: string,
      values?: unknown[],
    ): Promise<QueryResult<Row>>;
    end(): Promise<void>;
    on(event: 'notification', listener: (message: Notification) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }
}
