import { baseConfig } from './base.config'
import { resumeConfig } from './resume.config'
import { env } from './env'

// 业务统一读取本入口，保留原有配置文件和模块行为。
export const config = Object.freeze({
  app: baseConfig.app, // 服务基础配置
  database: Object.freeze({
    resume: resumeConfig.mysql, // 简历数据库连接
  }), // 数据库配置
  pdf: baseConfig.pdf, // 文档渲染配置
  ai: Object.freeze({
    apiKey: env.aiApiKey, // 人工智能上游密钥
    baseUrl: env.aiBaseUrl, // 人工智能上游地址
    model: env.aiModel, // 人工智能上游模型
  }), // 服务端人工智能配置，接口行为不变
  integrations: Object.freeze({
    timeout: env.integrationsTimeout, // 第三方上游统一超时
    github: Object.freeze({
      starsCacheTtl: env.githubStarsCacheTtl, // 星标缓存有效期
    }), // 仓库星标配置
  }), // 第三方集成配置，上游地址与凭据不暴露给浏览器
})
