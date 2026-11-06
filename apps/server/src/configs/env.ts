import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

// 运行环境标识，未显式指定时按本地开发处理
const mode = process.env.NODE_ENV || 'development'

// 在配置创建与数据库探测之前按运行环境加载分环境文件，系统/pm2 环境变量优先于文件。
// 优先级：系统/pm2 环境变量 > .env.{运行环境}（分环境，不入库，仅本地与部署机存在）
const directory = existsSync(resolve(process.cwd(), 'apps/server/package.json'))
  ? resolve(process.cwd(), 'apps/server')
  : process.cwd()
const envPath = resolve(directory, `.env.${mode}`)
if (existsSync(envPath)) loadEnvFile(envPath)

// 浏览器内核目录与安装脚本 scripts/installChrome.mjs 保持一致，
// 在 Playwright 模块加载前设定，避免运行用户与安装用户 HOME 不同导致找不到内核
process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve(directory, '../../.cache/ms-playwright')

export function envString(name: string, fallback = ''): string {
  return process.env[name] || fallback
}

// 必填配置缺失时立即报错，避免静默回落到本地地址导致线上行为异常
export function envStringRequired(name: string): string {
  const value = envString(name)
  if (!value) throw new Error(`缺少必需配置 ${name}，请在 apps/server/.env.${mode} 中补充`)
  return value
}

export function envNumber(name: string, fallback: number): number {
  const value = Number(envString(name, String(fallback)))
  if (!Number.isInteger(value) || value < 0) throw new Error(`配置 ${name} 必须为非负整数`)
  return value
}

export const env = Object.freeze({
  // 简历库连接参数，真实值只写入不入库的分环境文件 .env.{运行环境}
  resumeDbHost: envStringRequired('DB_RESUME_HOST'), // 简历数据库主机
  resumeDbPort: envNumber('DB_RESUME_PORT', 3306), // 简历数据库端口
  resumeDbUsername: envStringRequired('DB_RESUME_USERNAME'), // 简历数据库用户名
  resumeDbPassword: envStringRequired('DB_RESUME_PASSWORD'), // 简历数据库密码
  resumeDbDatabase: envStringRequired('DB_RESUME_DATABASE'), // 简历数据库名称
  aiApiKey: envString('OPENAI_API_KEY'), // 人工智能上游密钥
  aiBaseUrl: envString('OPENAI_BASE_URL'), // 人工智能上游完整地址
  aiModel: envStringRequired('OPENAI_MODEL'), // 人工智能上游模型
  // 打印页面地址，由站点根地址拼接固定路由 /resume/print
  pdfRenderUrl: `${envStringRequired('PUBLIC_SITE_URL')}/resume/print`,
  pdfTimeout: envNumber('PDF_RENDER_TIMEOUT', 60000), // 单次渲染总超时（含页面加载、等待就绪与生成），单位毫秒
  githubStarsCacheTtl: envNumber('GITHUB_STARS_CACHE_TTL', 1800000), // 仓库星标缓存有效期，单位毫秒
  integrationsTimeout: envNumber('INTEGRATIONS_TIMEOUT', 5000), // 第三方上游超时，单位毫秒
})
