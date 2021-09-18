import { addPath as ghAddPath } from "@actions/core"
import { delimiter } from "path"
import * as core from "@actions/core"
import execa from "execa"

/** An add path function that works locally or inside GitHub Actions */
export async function addPath(path: string) {
  try {
    ghAddPath(path)
  } catch (err) {
    try {
      core.error(err as Error)
      switch (process.platform) {
        case "win32": {
          await execa(`setx PATH=${path};%PATH%`)
          return
        }
        case "linux":
        case "darwin": {
          await execa.command(`echo "export PATH=${path}:$PATH" >> ~/.profile`)
          await execa.command(`source ~/.profile`)
          core.info(`${path} was added to ~/.profile`)
          return
        }
        default: {
          // fall through shell path modification
        }
      }
    } catch (err2) {
      core.error(err2 as Error)
    }
    core.error(`Failed to add ${path} to the percistent PATH. You should add it manually.`)
    process.env.PATH = `${path}${delimiter}${process.env.PATH}`
  }
}