export namespace Route {
  export type MetaArgs = {
    params: Record<string, string>;
    data?: any; // loaderから返されるデータ
  };
}
