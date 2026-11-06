import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ReportActionDto } from './dto/report-action.dto'
import { ReportVisitorDto } from './dto/report-visitor.dto'
import { StatsService } from './stats.service'

@ApiTags('简历统计')
@Controller('resume/stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @ApiOperation({ summary: '登记匿名访客' })
  @HttpCode(HttpStatus.OK)
  @Post('visitor')
  reportVisitor(@Body() reportVisitorDto: ReportVisitorDto) {
    return this.statsService.reportVisitor(reportVisitorDto)
  }

  @ApiOperation({ summary: '上报简历使用动作' })
  @HttpCode(HttpStatus.OK)
  @Post('action')
  reportAction(@Body() reportActionDto: ReportActionDto) {
    return this.statsService.reportAction(reportActionDto)
  }

  // 仅累计成功完成的 AI 使用次数。
  @ApiOperation({ summary: '记录一次 AI 使用' })
  @HttpCode(HttpStatus.OK)
  @Post('ai-usage')
  reportAiUsage() {
    return this.statsService.reportAiUsage()
  }

  @ApiOperation({ summary: '获取 AI 使用次数' })
  @Get('ai-usage')
  getAiUsage() {
    return this.statsService.getAiUsage()
  }

  @ApiOperation({ summary: '简历统计概览' })
  @Get('overview')
  getOverview(@Query('days') days?: string) {
    // 趋势天数默认取 30 天，上限 90 天避免过大的查询范围
    const requestedDays = Number(days)
    const range = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.min(requestedDays, 90) : 30

    return this.statsService.getOverview(range)
  }
}
