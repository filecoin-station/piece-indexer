/**
 * @param {Response} res
 * @param {string} [errorMsg]
 */
export async function assertOkResponse (res, errorMsg) {
  if (res.ok) return

  let body
  try {
    body = await res.text()
  } catch {}
  const err = new Error(`${errorMsg ?? `Cannot fetch ${res.url}`} (${res.status}): ${body?.trimEnd()}`)
  Object.assign(err, {
    statusCode: res.status,
    serverMessage: body
  })
  throw err
}
