import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { randomInt } from 'node:crypto'
import {
  SYNC_CODE_ALPHABET,
  SYNC_CODE_LENGTH,
  SYNC_MAX_RECORDS,
  SYNC_MAX_TOTAL_BYTES,
  SYNC_SWEEP_INTERVAL_MS,
  SYNC_TTL_MS,
} from './sync.constants'

/** 一条内存中转记录 */
export type SyncRecord = {
  /** 6 位取件码，领取时使用 */
  code: string
  /** 云端主键：发布者标识与简历编号，覆盖时据此命中 */
  syncKey: string
  /** 简历 JSON 原文，领取后立即从内存移除 */
  payload: string
  /** 载荷字节数，用于总量预算 */
  bytes: number
  /** 创建时间戳（毫秒） */
  createdAt: number
  /** 失效时间戳（毫秒） */
  expiresAt: number
}

/** 发布结果 */
export type SyncSaveResult = {
  /** 6 位取件码 */
  code: string
  /** 失效时间戳（毫秒） */
  expiresAt: number
}

@Injectable()
export class SyncStore implements OnModuleInit, OnModuleDestroy {
  // 按取件码索引，领取时直接命中
  private readonly records = new Map<string, SyncRecord>()
  // 按云端主键索引，同编号重复发布时复用取件码
  private readonly recordsByKey = new Map<string, SyncRecord>()
  // 已占用的总字节
  private totalBytes = 0
  private sweepTimer?: NodeJS.Timeout

  onModuleInit() {
    // 用固定间隔清扫，避免给每条记录挂定时器
    this.sweepTimer = setInterval(() => this.sweep(), SYNC_SWEEP_INTERVAL_MS)
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
  }

  // 发布：同主键覆盖内容并续期，取件码保持不变
  save(clientId: string, resumeId: string, payload: string, bytes: number): SyncSaveResult | null {
    const syncKey = `${clientId}:${resumeId}`
    const now = Date.now()
    const existing = this.recordsByKey.get(syncKey)

    if (existing && existing.expiresAt > now) {
      this.totalBytes += bytes - existing.bytes
      existing.payload = payload
      existing.bytes = bytes
      existing.expiresAt = now + SYNC_TTL_MS
      return { code: existing.code, expiresAt: existing.expiresAt }
    }

    // 旧记录已过期时先释放它占用的预算
    if (existing) this.remove(existing)

    if (this.records.size >= SYNC_MAX_RECORDS) return null
    if (this.totalBytes + bytes > SYNC_MAX_TOTAL_BYTES) return null

    const code = this.createCode()
    if (!code) return null

    const record: SyncRecord = {
      code,
      syncKey,
      payload,
      bytes,
      createdAt: now,
      expiresAt: now + SYNC_TTL_MS,
    }
    this.records.set(code, record)
    this.recordsByKey.set(syncKey, record)
    this.totalBytes += bytes
    return { code, expiresAt: record.expiresAt }
  }

  // 判断该简历是否还有有效期内的记录，用于区分覆盖与新增
  has(clientId: string, resumeId: string): boolean {
    const record = this.recordsByKey.get(`${clientId}:${resumeId}`)
    return !!record && record.expiresAt > Date.now()
  }

  // 领取：取出即销毁，过期同样视为不存在
  take(code: string): SyncRecord | null {
    const record = this.records.get(code)
    if (!record) return null
    if (record.expiresAt <= Date.now()) {
      this.remove(record)
      return null
    }
    this.remove(record)
    return record
  }

  // 清扫到期记录，回收字节预算
  sweep() {
    const now = Date.now()
    for (const record of this.records.values()) {
      if (record.expiresAt <= now) this.remove(record)
    }
  }

  private remove(record: SyncRecord) {
    if (this.records.get(record.code) === record) this.records.delete(record.code)
    if (this.recordsByKey.get(record.syncKey) === record) this.recordsByKey.delete(record.syncKey)
    this.totalBytes -= record.bytes
  }

  private createCode(): string {
    // 碰撞时重试，空间足够大，正常一次就能拿到
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let code = ''
      for (let index = 0; index < SYNC_CODE_LENGTH; index += 1) {
        code += SYNC_CODE_ALPHABET[randomInt(0, SYNC_CODE_ALPHABET.length)]
      }
      if (!this.records.has(code)) return code
    }
    return ''
  }
}
