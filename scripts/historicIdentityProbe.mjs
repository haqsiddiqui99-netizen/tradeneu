/**
 * HTTP probe: true only if 127.0.0.1:port is `server/historicGoldApi.mjs` (Suplexity historic API).
 */
import http from 'node:http'

export const HISTORIC_IDENTITY_APP = 'suplexity-historic-api'

export function historicApiIdentityOk(port = 3001, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/api/historic/identity`, (res) => {
      let buf = ''
      res.on('data', (c) => {
        buf += c
      })
      res.on('end', () => {
        try {
          const j = JSON.parse(buf)
          resolve(
            res.statusCode === 200 &&
              j &&
              typeof j === 'object' &&
              j.ok === true &&
              j.app === HISTORIC_IDENTITY_APP,
          )
        } catch {
          resolve(false)
        }
      })
    })
    req.setTimeout(1500, () => {
      try {
        req.destroy()
      } catch {
        /* noop */
      }
      resolve(false)
    })
    req.on('error', () => resolve(false))
  })
}
