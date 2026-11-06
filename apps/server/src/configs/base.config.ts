import { env } from './env'
export const baseConfig = {
  // 应用配置
  app: {
    // 服务名称
    name: '雪花服务',
    // 端口号
    port: 3000,
    // JSON请求体最大限制
    bodyLimit: '50mb',
    // 跨域配置
    cors: {
      origin: '*',
    },
  },
  // PDF渲染页面配置
  pdf: {
    renderUrl: env.pdfRenderUrl, // 打印页面地址
    timeout: env.pdfTimeout, // 单次渲染总超时，单位毫秒
  },
}
