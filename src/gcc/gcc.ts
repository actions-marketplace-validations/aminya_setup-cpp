import { addPath, addEnv } from "../utils/env/addEnv"
import { existsSync } from "fs"
import { setupAptPack, updateAptAlternatives } from "../utils/setup/setupAptPack"
import { setupBrewPack } from "../utils/setup/setupBrewPack"
import { setupChocoPack } from "../utils/setup/setupChocoPack"
import semverMajor from "semver/functions/major"
import semverCoerce from "semver/functions/coerce"
import { setupMacOSSDK } from "../macos-sdk/macos-sdk"
import path from "path"
import { warning, info, notice } from "../utils/io/io"
import { isGitHubCI } from "../utils/env/isci"
import { addBinExtension } from "../utils/extension/extension"
import { InstallationInfo, PackageInfo, setupBin } from "../utils/setup/setupBin"
import { extract7Zip } from "../utils/setup/extract"

interface MingwInfo {
  mingwVersion: string
  llvmVersion?: string
  number: string
  runtime: "ucrt" | "msvcrt" // ucrt is the modern runtime and should be preferred
}

const GccToMingwInfo = {
  "12": { mingwVersion: "10.0.0", number: "r1", runtime: "msvcrt" },
  "12.1.0-msvcrt": { mingwVersion: "10.0.0", number: "r1", runtime: "msvcrt" },
  "11": { mingwVersion: "10.0.0", llvmVersion: "14.0.3", number: "r3", runtime: "ucrt" },
  "11.3.0-ucrt": { mingwVersion: "10.0.0", llvmVersion: "14.0.3", number: "r3", runtime: "ucrt" },
  "11.3.0-msvcrt": { mingwVersion: "10.0.0", llvmVersion: "14.0.3", number: "r3", runtime: "msvcrt" },
  "11.2.0-ucrt": { mingwVersion: "9.0.0", number: "r5", runtime: "ucrt" },
  "11.2.0-msvcrt": { mingwVersion: "9.0.0", number: "r6", runtime: "msvcrt" }, // TODO -w64-
} as Record<string, MingwInfo | undefined>

function getGccPackageInfo(version: string, platform: NodeJS.Platform, arch: string): PackageInfo {
  switch (platform) {
    case "win32": {
      const mingwInfo = GccToMingwInfo[version]
      if (mingwInfo === undefined) {
        throw new Error(`mingw version ${version} is not supported`)
      }
      const mingwArch = arch === "ia32" ? "i686" : "x86_64"
      const llvmVersionString = mingwInfo.llvmVersion !== undefined ? `${mingwInfo.llvmVersion}-` : ""
      return {
        binRelativeDir: "./bin",
        binFileName: addBinExtension("g++"),
        extractedFolderName: "mingw64",
        extractFunction: extract7Zip,
        url: `https://github.com/brechtsanders/winlibs_mingw/releases/download/${version}-${llvmVersionString}${mingwInfo.mingwVersion}-${mingwInfo.runtime}-${mingwInfo.number}/winlibs-${mingwArch}-posix-seh-gcc-${version}-mingw-w64${mingwInfo.runtime}-${mingwInfo.mingwVersion}-${mingwInfo.number}.7z`,
      }
    }
    default:
      throw new Error(`Unsupported platform '${platform}'`)
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function setupGcc(version: string, setupDir: string, arch: string) {
  let installationInfo: InstallationInfo | undefined
  switch (process.platform) {
    case "win32": {
      if (arch === "arm" || arch === "arm64") {
        await setupChocoPack("gcc-arm-embedded", version)
      }
      try {
        installationInfo = await setupBin("g++", version, getGccPackageInfo, setupDir, arch)
      } catch (err) {
        notice(`Failed to download g++ binary. ${err}. Falling back to chocolatey.`)
        installationInfo = await setupChocoMingw(version, arch)
      }
      break
    }
    case "darwin": {
      installationInfo = setupBrewPack("gcc", version)
      break
    }
    case "linux": {
      if (arch === "x64") {
        setupAptPack("gcc", version, ["ppa:ubuntu-toolchain-r/test"])
        installationInfo = setupAptPack("g++", version, [])
      } else {
        info(`Install g++-multilib because gcc for ${arch} was requested`)
        setupAptPack("gcc-multilib", version, ["ppa:ubuntu-toolchain-r/test"])
        installationInfo = setupAptPack("g++-multilib", version, [])
      }
      break
    }
    // TODO support bare-metal (need to support passing it as the input)
    // TODO support abi
    // case "none": {
    //   if (arch === "arm" || arch === "arm64") {
    //     return setupAptPack("gcc-arm-none-eabi", version, [
    //       "ppa:ubuntu-toolchain-r/test",
    //     ])
    //   } else {
    //     throw new Error(`Unsupported platform for ${arch}`)
    //   }
    // }
    default: {
      throw new Error(`Unsupported platform for ${arch}`)
    }
  }
  if (installationInfo !== undefined) {
    await activateGcc(version, installationInfo.binDir)
    return installationInfo
  }
  return undefined
}

async function setupChocoMingw(version: string, arch: string): Promise<InstallationInfo | undefined> {
  await setupChocoPack("mingw", version)
  let binDir: string | undefined
  if (arch === "x64" && existsSync("C:/tools/mingw64/bin")) {
    binDir = "C:/tools/mingw64/bin"
    await addPath(binDir)
  } else if (arch === "ia32" && existsSync("C:/tools/mingw32/bin")) {
    binDir = "C:/tools/mingw32/bin"
    await addPath(binDir)
  } else if (existsSync(`${process.env.ChocolateyInstall ?? "C:/ProgramData/chocolatey"}/bin/g++.exe`)) {
    binDir = `${process.env.ChocolateyInstall ?? "C:/ProgramData/chocolatey"}/bin`
  }
  if (binDir !== undefined) {
    return { binDir }
  }
  return undefined
}

async function activateGcc(version: string, binDir: string) {
  const promises: Promise<void>[] = []
  // Setup gcc as the compiler

  // TODO
  // const ld = process.env.LD_LIBRARY_PATH ?? ""
  // const dyld = process.env.DYLD_LIBRARY_PATH ?? ""
  // promises.push(
  //   addEnv("LD_LIBRARY_PATH", `${installDir}/lib${path.delimiter}${ld}`),
  //   addEnv("DYLD_LIBRARY_PATH", `${installDir}/lib${path.delimiter}${dyld}`),
  //   addEnv("CPATH", `${installDir}/lib/gcc/${majorVersion}/include`),
  //   addEnv("LDFLAGS", `-L${installDir}/lib`),
  //   addEnv("CPPFLAGS", `-I${installDir}/include`)
  // )

  if (process.platform === "win32") {
    promises.push(addEnv("CC", addBinExtension(`${binDir}/gcc`)), addEnv("CXX", addBinExtension(`${binDir}/g++`)))
  } else {
    const majorVersion = semverMajor(semverCoerce(version) ?? version)
    if (majorVersion >= 5) {
      promises.push(addEnv("CC", `${binDir}/gcc-${majorVersion}`), addEnv("CXX", `${binDir}/g++-${majorVersion}`))

      if (process.platform === "linux") {
        updateAptAlternatives("cc", `${binDir}/gcc-${majorVersion}`)
        updateAptAlternatives("cxx", `${binDir}/g++-${majorVersion}`)
        updateAptAlternatives("gcc", `${binDir}/gcc-${majorVersion}`)
        updateAptAlternatives("g++", `${binDir}/g++-${majorVersion}`)
      }
    } else {
      promises.push(addEnv("CC", `${binDir}/gcc-${version}`), addEnv("CXX", `${binDir}/g++-${version}`))

      if (process.platform === "linux") {
        updateAptAlternatives("cc", `${binDir}/gcc-${version}`)
        updateAptAlternatives("cxx", `${binDir}/g++-${version}`)
        updateAptAlternatives("gcc", `${binDir}/gcc-${version}`)
        updateAptAlternatives("g++", `${binDir}/g++-${version}`)
      }
    }
  }

  promises.push(setupMacOSSDK())

  if (isGitHubCI()) {
    addGccLoggingMatcher()
  }

  await Promise.all(promises)
}

function addGccLoggingMatcher() {
  const matcherPath = path.join(__dirname, "gcc_matcher.json")
  if (!existsSync(matcherPath)) {
    return warning("the gcc_matcher.json file does not exist in the same folder as setup_cpp.js")
  }
  info(`::add-matcher::${matcherPath}`)
}
