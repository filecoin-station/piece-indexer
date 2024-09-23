import { json, redirect } from 'http-responders'

/** @import { URLSearchParams } from 'node:url' */
/** @import {Repository, Logger} from './typings.d.ts' */

/**
 * @param {object} args
 * @param {Repository} args.repository
 * @param {string} args.domain
 * @param {Logger} args.logger
 */
export function createHandler ({ repository, domain, logger }) {
  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  return (req, res) => {
    const start = new Date()
    logger.request(`${req.method} ${req.url} ...`)
    handleRequest(req, res, { repository, domain, logger })
      .catch(err => errorHandler(res, err, logger))
      .then(() => {
        logger.request(`${req.method} ${req.url} ${res.statusCode} (${new Date() - start}ms)`)
      })
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {object} args
 * @param {Repository} args.repository
 * @param {string} args.domain
 * @param {Logger} args.logger
 */
async function handleRequest (req, res, { repository, domain, logger }) {
  if (req.headers.host.split(':')[0] !== domain) {
    return redirect(req, res, `https://${domain}${req.url}`, 301)
  }

  // Caveat! `new URL('//foo', 'http://127.0.0.1')` would produce "http://foo/" - not what we want!
  const { pathname, searchParams } = new URL(`http://127.0.0.1${req.url}`)
  const segs = pathname.split('/').filter(Boolean)
  // const url = `/${segs.join('/')}`

  if (req.method !== 'GET') {
    return notFound(res)
  }

  if (segs[0] === 'sample' && segs[1] && segs[2]) {
    await samplePiecePayloadBlocks(req, res, repository, segs[1], segs[2], searchParams)
  } else if (segs[0] === 'ingestion-status' && segs[1]) {
    await getProviderIngestionStatus(req, res, repository, segs[1])
  } else {
    notFound(res)
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {Repository} repository
 * @param {string} providerId
 * @param {string} pieceCid
 * @param {URLSearchParams} searchParams
 */
async function samplePiecePayloadBlocks (req, res, repository, providerId, pieceCid, searchParams) {
  const payloadCids = await repository.getPiecePayloadBlocks(providerId, pieceCid)
  const body = {}
  if (payloadCids.length) {
    body.samples = payloadCids.slice(0, 1)
    res.setHeader('cache-control', `public, max-age=${24 * 3600 /* 24 hours */}, immutable`)
  } else {
    body.error = 'PROVIDER_OR_PIECE_NOT_FOUND'
    res.setHeader('cache-control', `public, max-age=${60 /* 1min */}`)
  }
  return json(res, body)
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {Repository} repository
 * @param {string} providerId
 */
async function getProviderIngestionStatus (req, res, repository, providerId) {
  const walkerState = await repository.getWalkerState(providerId)
  res.setHeader('cache-control', `public, max-age=${60 /* 1min */}`)

  if (!walkerState) {
    return json(res, {
      providerId,
      ingestionStatus: 'Unknown provider ID'
    })
  }

  return json(res, {
    providerId,
    // Discussion point:
    // We don't have providerAddress in the walker state.
    // Is it a problem if our observability API does not tell the provider address?
    ingestionStatus: walkerState.status,
    lastHeadWalkedFrom: walkerState.lastHead ?? walkerState.head,
    piecesIndexed: await repository.countPiecesIndexed(providerId)
  })
}

function notFound (res) {
  res.statusCode = 404
  res.end('Not Found')
}

function errorHandler (res, err, logger) {
  if (err instanceof SyntaxError) {
    res.statusCode = 400
    res.end('Invalid JSON Body')
  } else if (err.statusCode) {
    res.statusCode = err.statusCode
    res.end(err.message)
  } else {
    logger.error(err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }

  // TBD: report internal errors to Sentry
  // if (res.statusCode >= 500) {
  //   Sentry.captureException(err)
  // }
}
