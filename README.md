# piece-indexer

A lightweight IPNI node mapping Filecoin PieceCID → payload block CID.

- [Design doc](./docs/design.md)

## Basic use

Note: this will change soon, see
https://github.com/filecoin-station/piece-indexer/issues/33

## `GET /sample/{provider-id}/{piece-cid}

Example:

https://pix.filspark.com/sample/12D3KooWHKeaNCnYByQUMS2n5PAZ1KZ9xKXqsb4bhpxVJ6bBJg5V/baga6ea4seaqlwzed5tgjtyhrugjziutzthx2wrympvsuqhfngwdwqzvosuchmja

```json
{
  "samples": ["bafkreigrnnl64xuevvkhknbhrcqzbdvvmqnchp7ae2a4ulninsjoc5svoq"]
}
```

## `GET /ingestion-status/{provider-id}`

Example:

https://pix.filspark.com/ingestion-status/12D3KooWHKeaNCnYByQUMS2n5PAZ1KZ9xKXqsb4bhpxVJ6bBJg5V

```json
{
  "providerId": "12D3KooWHKeaNCnYByQUMS2n5PAZ1KZ9xKXqsb4bhpxVJ6bBJg5V",
  "ingestionStatus": "All advertisements from baguqeeralhduow57bhqo5zgiwe6swgjrqw2nuckvnch6nlylaensfzf3bfyq to the end of the chain were processed.",
  "lastHeadWalkedFrom": "baguqeeralhduow57bhqo5zgiwe6swgjrqw2nuckvnch6nlylaensfzf3bfyq",
  "adsMissingPieceCID": 0,
  "entriesNotRetrievable": 0,
  "piecesIndexed": 6344
}
```

## Development

```bash
docker run --name redis -p 6379:6379 -d redis
npm start -w indexer
```

## Deployment

Pushes to `main` will be deployed automatically.

Perform manual devops using [Fly.io](https://fly.io):

Indexer:

```bash
$ fly deploy --remote-only -c indexer/fly.toml
$ fly deploy --remote-only -c api/fly.toml
```
