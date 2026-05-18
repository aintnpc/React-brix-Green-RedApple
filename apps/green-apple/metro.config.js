const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const { execSync } = require('child_process')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

let npmGlobalRoot = ''
try {
  npmGlobalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim()
} catch (_) {}

config.watchFolders = [workspaceRoot, ...(npmGlobalRoot ? [npmGlobalRoot] : [])]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// 모노레포 React 단일 인스턴스 강제 — resolveRequest로 어느 패키지에서 요청해도 앱의 것으로 고정
const reactPath = path.resolve(projectRoot, 'node_modules/react')
const reactNativePath = path.resolve(projectRoot, 'node_modules/react-native')

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    return context.resolveRequest(
      { ...context, originModulePath: reactPath + '/index.js' },
      moduleName,
      platform,
    )
  }
  if (moduleName === 'react-native' || moduleName.startsWith('react-native/')) {
    return context.resolveRequest(
      { ...context, originModulePath: reactNativePath + '/index.js' },
      moduleName,
      platform,
    )
  }
  return context.resolveRequest(context, moduleName, platform)
}

config.resolver.extraNodeModules = {
  react: reactPath,
  'react-native': reactNativePath,
}

config.resolver.unstable_enableSymlinks = true
config.resolver.unstable_enablePackageExports = true

module.exports = config
