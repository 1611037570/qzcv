import { Module } from '@nestjs/common'
import { SyncController } from './sync.controller'
import { SyncService } from './sync.service'
import { SyncStore } from './sync.store'

@Module({
  // 只吃进程内存，不注册数据库实体，简历库不可用时也能工作
  controllers: [SyncController],
  providers: [SyncService, SyncStore],
})
export class SyncModule {}
