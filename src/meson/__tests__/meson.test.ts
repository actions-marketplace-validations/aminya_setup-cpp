import { setupMeson } from "../meson"
import { testBin } from "../../utils/tests/test-helpers"
import { getVersion } from "../../versions/versions"
import { ubuntuVersion } from "../../utils/env/ubuntu_version"

jest.setTimeout(300000)
describe("setup-meson", () => {
  it("should setup meson", async () => {
    const installInfo = await setupMeson(getVersion("meson", "true", await ubuntuVersion()), "", process.arch)

    await testBin("meson", ["--version"], installInfo.binDir)
  })
})
