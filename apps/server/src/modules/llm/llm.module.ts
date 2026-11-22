import { DynamicModule, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BillingModule } from '../billing/billing.module'
import { LLMController } from './llm.controller'
import { LLMService } from './llm.service'
import { LlmUsageService } from './llm-usage.service'
import { LlmStatusService } from './llm-status.service'
import { LlmUsage } from './entities/llm-usage.entity'

@Module({})
export class LLMModule {
  // 简历库不可用时不注册消耗表，记账自动降级为日志输出，对话功能保持可用
  static register(usageEnabled: boolean): DynamicModule {
    return {
      module: LLMModule,
      // 计费模块提供钱包结算，余额为零时仍按免费额度放行
      imports: [...(usageEnabled ? [TypeOrmModule.forFeature([LlmUsage], 'resume')] : []), BillingModule],
      controllers: [LLMController],
      providers: [LLMService, LlmUsageService, LlmStatusService],
      exports: [LLMService],
    }
  }
}
