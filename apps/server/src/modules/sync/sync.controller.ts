import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { createHash } from 'node:crypto'
import type { Request } from 'express'
import { FetchSyncDto } from './dto/fetch-sync.dto'
import { PublishSyncDto } from './dto/publish-sync.dto'
import { SyncService } from './sync.service'

@ApiTags('设备互传')
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @ApiOperation({ summary: '发布简历，返回 6 位取件码' })
  @HttpCode(HttpStatus.OK)
  @Post()
  publish(@Req() req: Request, @Body() dto: PublishSyncDto) {
    return this.syncService.publish(dto.clientId, this.ipHash(req), dto.data)
  }

  @ApiOperation({ summary: '凭取件码领取，取出即销毁' })
  @HttpCode(HttpStatus.OK)
  @Post('fetch')
  fetch(@Req() req: Request, @Body() dto: FetchSyncDto) {
    return this.syncService.fetch(dto.code, this.ipHash(req))
  }

  // 限流只按来源 IP 的哈希计数，不记录明文地址；真实来源取自反代写入的转发头
  private ipHash(req: Request) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
    const ip = forwarded || req.ip || ''
    return createHash('sha256').update(ip).digest('hex')
  }
}
