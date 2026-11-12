import { Injectable } from '@nestjs/common'
import { config } from '../../configs'

// 前端传入的模型标识格式：snowflake:<用途>。用途与 OPENAI_MODEL_<用途> 的变量名同源。
const BUILTIN_PATTERN = /^snowflake:([a-z]+)$/

// 同一类标识问题只提示一次，避免流式请求把日志刷满
const warnedKeys = new Set<string>()

@Injectable()
export class LLMService {
  /**
   * 解析本次请求实际使用的上游模型。
   * 前端只能传内置用途标识，真实模型名由服务端环境变量决定；未知用途或未配置时回退兜底模型。
   */
  resolveModel(requested?: unknown) {
    const purpose = typeof requested === 'string' ? requested.match(BUILTIN_PATTERN)?.[1] : undefined

    // 传了标识却不符合约定，说明前后端命名不一致，记录下来再回退
    if (typeof requested === 'string' && requested && !purpose) {
      this.warnOnce(requested, `未知的内置模型标识「${requested}」，已回退兜底模型`)
      return config.ai.assistantModel
    }

    if (!purpose) return config.ai.assistantModel

    const model = config.ai.modelByPurpose(purpose)
    if (!model) {
      this.warnOnce(purpose, `未配置 OPENAI_MODEL_${purpose.toUpperCase()}，已回退兜底模型`)
      return config.ai.assistantModel
    }
    return model
  }

  // 同一个键只打印一次，避免刷屏又不至于静默
  private warnOnce(key: string, message: string) {
    if (warnedKeys.has(key)) return
    warnedKeys.add(key)
    console.warn(message)
  }

  /**
   * 获取上游 AI 服务的原始响应
   * 客户端断开时由调用方传入的 signal 中止，避免空转继续消耗额度。
   */
  async getUpstreamResponse(data: Record<string, any>, signal?: AbortSignal) {
    const apiKey = config.ai.apiKey
    const baseURL = config.ai.baseUrl
    const url = `${baseURL}`
    // 前端传的模型标识在这里被替换成实际上游模型名
    const model = this.resolveModel(data?.model)

    const response = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ...data,
        model,
        // 上游密钥只保存在服务端，流式用量必须由服务端索取，不能依赖前端传参
        stream_options: {
          ...(data?.stream_options ?? {}),
          include_usage: true,
        },
        stream: true,
      }),
    })

    return response
  }
}
