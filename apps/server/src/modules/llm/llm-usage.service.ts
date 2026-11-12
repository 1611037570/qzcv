import { Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { config } from '../../configs'
import { LlmUsage } from './entities/llm-usage.entity'

// 一次请求实际结算到的用量，字段缺失时由调用方补估算值
export type LlmUsageResult = {
  promptTokens: number // 输入消耗令牌数
  completionTokens: number // 输出消耗令牌数
  totalTokens: number // 本次消耗令牌总数
  estimated: boolean // 是否为本地估算结果
}

@Injectable()
export class LlmUsageService {
  constructor(
    // 简历库不可用时该提供者为空，记账降级为只打印日志
    @Optional()
    @InjectRepository(LlmUsage, 'resume')
    private readonly repository: Repository<LlmUsage> | null,
  ) {}

  // 落库一次消耗记录。记账失败不能影响已经完成的对话，因此只上报错误不再抛出。
  async record(input: {
    clientKey: string // 使用者标识
    ipHash: string // 来源 IP 哈希
    model: string // 实际使用的上游模型
    usage: LlmUsageResult // 本次结算到的用量
  }) {
    if (!this.repository) {
      console.warn('令牌消耗未落库（简历库不可用）', input.clientKey, input.usage.totalTokens)
      return
    }

    try {
      await this.repository.insert({
        clientKey: input.clientKey,
        ipHash: input.ipHash,
        model: input.model,
        promptTokens: input.usage.promptTokens,
        completionTokens: input.usage.completionTokens,
        totalTokens: input.usage.totalTokens,
        estimated: input.usage.estimated ? 1 : 0,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('令牌消耗落库失败', message)
    }
  }

  // 汇总单个使用者的累计消耗，用于展示剩余免费额度；本阶段不做拦截。
  async summary(clientKey: string) {
    const freeTokens = config.ai.freeTokens
    if (!this.repository) return { usedTokens: 0, freeTokens, remainingTokens: freeTokens, requests: 0 }

    const row = await this.repository
      .createQueryBuilder('usage')
      .select('COALESCE(SUM(usage.total_tokens), 0)', 'used')
      .addSelect('COUNT(*)', 'requests')
      .where('usage.client_key = :clientKey', { clientKey })
      .getRawOne<{ used: string; requests: string }>()

    const usedTokens = Number(row?.used ?? 0)
    return {
      usedTokens,
      freeTokens,
      // 可能为负数，由前端决定如何提示，不在服务端截断
      remainingTokens: freeTokens - usedTokens,
      requests: Number(row?.requests ?? 0),
    }
  }
}
