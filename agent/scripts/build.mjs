import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

// rm -rf dist
fs.rmSync(path.resolve(process.cwd(), 'dist'), { recursive: true, force: true })

// 读取 package.json, 拿到所有 dependencies / peerDependencies
const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'))
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
]

build({
  /**
   * 入口文件
   */
  entryPoints: ['src/index.ts'],

  /**
   * 输出目录
   */
  outdir: 'dist',

  /**
   * 启用打包/路径解析
   */
  bundle: true,

  /**
   * 输出 ESM
   */
  format: 'esm',

  platform: 'node',

  /**
   * 服务器的 Node 版本
   */
  target: 'node24',

  /**
   * 排除依赖
   */
  external,

  /**
   * 生成 source map
   */
  sourcemap: true,

  logLevel: 'info',
}).catch(() => process.exit(1))
