export { RedisRepository as Repository } from '@filecoin-station/spark-piece-indexer-repository'

export interface Logger {
  info: typeof console.info;
  error: typeof console.error;
  request: typeof console.info;
}
