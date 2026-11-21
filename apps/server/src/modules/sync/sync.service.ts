import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common'
import {
  SYNC_CIRCUIT_FAILURE_LIMIT,
  SYNC_CIRCUIT_MS,
  SYNC_FAILURE_LIMIT,
  SYNC_FAILURE_WINDOW_MS,
  SYNC_LOCK_MS,
  SYNC_MAX_PAYLOAD_BYTES,
  SYNC_PRUNE_INTERVAL_MS,
  SYNC_PUBLISH_GLOBAL_PER_MINUTE,
  SYNC_PUBLISH_PER_CLIENT,
  SYNC_PUBLISH_PER_IP,
  SYNC_PUBLISH_WINDOW_MS,
} from './sync.constants'
import { SyncStore } from './sync.store'

@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  // 单设备发布窗口：clientId 到时间戳队列
  private readonly publishByClient = new Map<string, number[]>()
  // 单 IP 发布窗口
  private readonly publishByIp = new Map<string, number[]>()
  // 全站发布速率窗口
  private readonly globalPublish: number[] = []
  // 领取失败窗口：ipHash 到时间戳队列
  private readonly fetchFailures = new Map<string, number[]>()
  // 触发失败上限后的锁定到期时间
  private readonly fetchLocks = new Map<string, number>()
  // 全站失败时间戳，用于熔断
  private readonly globalFailures: number[] = []
  // 熔断到期时间，期间暂停发新码
  private circuitOpenUntil = 0
  private pruneTimer?: NodeJS.Timeout

  constructor(private readonly store: SyncStore) {}

  onModuleInit() {
    this.pruneTimer = setInterval(() => this.pruneRateMaps(), SYNC_PRUNE_INTERVAL_MS)
  }

  onModuleDestroy() {
    if (this.pruneTimer) clearInterval(this.pruneTimer)
  }

  // 发布简历，返回 6 位取件码
  publish(clientId: string, ipHash: string, data: Record<string, any>) {
    const payload = JSON.stringify(data)
    if (Buffer.byteLength(payload) > SYNC_MAX_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException('简历超过 4MB，无法同步')
    }

    // 熔断期间只停发新码，已有取件码仍可领取
    if (this.circuitOpenUntil > Date.now()) {
      throw new HttpException('同步请求过多，请稍后再试', HttpStatus.TOO_MANY_REQUESTS)
    }

    const resumeId = typeof data?.id === 'string' ? data.id.trim() : ''
    if (!resumeId || resumeId.length > 64) throw new BadRequestException('简历缺少有效编号')

    // 同编号覆盖的是同一份记录，不占用每小时的新增配额
    const isUpdate = this.store.has(clientId, resumeId)
    this.hit(this.globalPublish, SYNC_PUBLISH_GLOBAL_PER_MINUTE, 60 * 1000, '同步请求过于频繁，请稍后再试')
    if (!isUpdate) {
      this.hitKeyed(this.publishByClient, clientId, SYNC_PUBLISH_PER_CLIENT, SYNC_PUBLISH_WINDOW_MS, '云同步每小时最多生成 3 次取件码')
      this.hitKeyed(this.publishByIp, ipHash, SYNC_PUBLISH_PER_IP, SYNC_PUBLISH_WINDOW_MS, '当前网络生成次数过多，请稍后再试')
    }

    const result = this.store.save(clientId, resumeId, payload, Buffer.byteLength(payload))
    if (!result) throw new HttpException('同步容量已满，请稍后再试', HttpStatus.SERVICE_UNAVAILABLE)
    return result
  }

  // 领取简历，取出即销毁
  fetch(code: string, ipHash: string) {
    this.assertNotLocked(ipHash)
    const record = this.store.take(String(code ?? '').trim().toUpperCase())

    if (!record) {
      this.registerFailure(ipHash)
      throw new NotFoundException('取件码无效或已过期')
    }

    this.clearFailures(ipHash)
    try {
      return { data: JSON.parse(record.payload) }
    } catch {
      throw new InternalServerErrorException('简历数据已损坏，请重新生成取件码')
    }
  }

  private assertNotLocked(ipHash: string) {
    if ((this.fetchLocks.get(ipHash) ?? 0) > Date.now()) {
      throw new HttpException('尝试次数过多，请稍后再试', HttpStatus.TOO_MANY_REQUESTS)
    }
  }

  // 失败累计到上限就锁一段时间，同时喂全站熔断计数
  private registerFailure(ipHash: string) {
    const now = Date.now()
    let events = this.fetchFailures.get(ipHash)
    if (!events) {
      events = []
      this.fetchFailures.set(ipHash, events)
    }
    const start = now - SYNC_FAILURE_WINDOW_MS
    while (events.length && events[0] <= start) events.shift()
    events.push(now)

    if (events.length >= SYNC_FAILURE_LIMIT) {
      this.fetchLocks.set(ipHash, now + SYNC_LOCK_MS)
      events.length = 0
    }

    const globalStart = now - 60 * 1000
    while (this.globalFailures.length && this.globalFailures[0] <= globalStart) this.globalFailures.shift()
    this.globalFailures.push(now)
    if (this.globalFailures.length >= SYNC_CIRCUIT_FAILURE_LIMIT) {
      this.circuitOpenUntil = now + SYNC_CIRCUIT_MS
    }
  }

  private clearFailures(ipHash: string) {
    this.fetchFailures.delete(ipHash)
  }

  // 滑动窗口限流：窗口内超限直接拒绝
  private hit(events: number[], limit: number, windowMs: number, message: string) {
    const now = Date.now()
    const start = now - windowMs
    while (events.length && events[0] <= start) events.shift()
    if (events.length >= limit) throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
    events.push(now)
  }

  // 按标识分别计数的滑动窗口
  private hitKeyed(map: Map<string, number[]>, key: string, limit: number, windowMs: number, message: string) {
    let events = map.get(key)
    if (!events) {
      events = []
      map.set(key, events)
    }
    this.hit(events, limit, windowMs, message)
  }

  // 定期丢掉过期的计数，避免映射无限增长
  private pruneRateMaps() {
    const now = Date.now()
    this.pruneMap(this.publishByClient, SYNC_PUBLISH_WINDOW_MS, now)
    this.pruneMap(this.publishByIp, SYNC_PUBLISH_WINDOW_MS, now)
    this.pruneMap(this.fetchFailures, SYNC_FAILURE_WINDOW_MS, now)
    for (const [key, lockedUntil] of this.fetchLocks) {
      if (lockedUntil <= now) this.fetchLocks.delete(key)
    }
  }

  private pruneMap(map: Map<string, number[]>, windowMs: number, now: number) {
    const start = now - windowMs
    for (const [key, events] of map) {
      while (events.length && events[0] <= start) events.shift()
      if (!events.length) map.delete(key)
    }
  }
}
