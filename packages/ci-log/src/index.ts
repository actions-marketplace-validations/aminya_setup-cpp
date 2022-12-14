import * as core from "@actions/core"
import ciDetect from "@npmcli/ci-detect"

export function error(err: string | Error) {
  return ciDetect() === "github-actions" ? core.error(err) : console.log(`\x1b[31m${err}\x1b[0m`)
}

export function success(msg: string) {
  return console.log(`\x1b[32m${msg}\x1b[0m`)
}

export function warning(msg: string) {
  return ciDetect() === "github-actions" ? core.warning(msg) : console.log(`\x1b[33m${msg}\x1b[0m`)
}

export function notice(msg: string) {
  return ciDetect() === "github-actions" ? core.notice(msg) : console.log(`\x1b[94m${msg}\x1b[0m`)
}

export function info(msg: string) {
  return ciDetect() === "github-actions" ? core.info(msg) : console.log(msg)
}
