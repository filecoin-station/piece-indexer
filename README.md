# piece-indexer

A lightweight IPNI node mapping Filecoin PieceCID → payload block CID.

- [Design doc](./docs/design.md)

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
```
