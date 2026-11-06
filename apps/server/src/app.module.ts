import { DynamicModule, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { IntegrationsModule } from './modules/integrations/integrations.module'
import { LLMModule } from './modules/llm/llm.module'
import { config } from './configs'
import { PdfModule } from './modules/resume/pdf/pdf.module'
import { StatsModule } from './modules/resume/stats/stats.module'
import { Action } from './modules/resume/entities/action.entity'
import { Visitor } from './modules/resume/entities/visitor.entity'

@Module({
  // 仅注册简历及其共用服务。
  imports: [
    LLMModule,
    IntegrationsModule,
    PdfModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  // 简历库不可用时仅关闭统计模块，不影响导出与人工智能服务。
  static register(resumeDatabaseEnabled: boolean): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ...(resumeDatabaseEnabled
          ? [
              // 仅登记简历统计实体，保留现有简历数据源名称。
              TypeOrmModule.forRoot({
                name: 'resume',
                ...config.database.resume,
                entities: [Visitor, Action],
              }),
              StatsModule,
            ]
          : []),
      ],
    }
  }
}
