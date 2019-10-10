import { DataSource } from "../datasource/interfaces";
import { Span } from '../span';

export interface API {
    search(query: SearchQuery): Promise<SearchResulList>;
    test(): Promise<void>;
    getServicesAndOperations(): { [key: string]: string[] };
    updateServicesAndOperationsCache(): Promise<{ [key: string]: string[] }>;
}


export interface SearchQuery {
  dataSource?: DataSource,
  serviceName: string,
  operationName?: string,
  startTime: number,
  finishTime: number,
  tags: (string | { [key: string]: string })[],
  minDuration?: number,
  maxDuration?: number,
  limit: number,
  offset?: number
}


export interface SearchResulList {
  query: SearchQuery,
  data: Span[][];
}
