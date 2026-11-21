// 取件码字符集：去掉易混的 0 O 1 I L，剩 31 个字符，6 位约 8.9 亿种
export const SYNC_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

// 取件码长度
export const SYNC_CODE_LENGTH = 6

// 单份简历载荷上限
export const SYNC_MAX_PAYLOAD_BYTES = 4 * 1024 * 1024

// 进程内总字节预算
export const SYNC_MAX_TOTAL_BYTES = 64 * 1024 * 1024

// 同屏条目上限
export const SYNC_MAX_RECORDS = 2000

// 无人领取的存活时间
export const SYNC_TTL_MS = 5 * 60 * 1000

// 过期记录清扫间隔
export const SYNC_SWEEP_INTERVAL_MS = 60 * 1000

// 发布配额：单设备每小时
export const SYNC_PUBLISH_PER_CLIENT = 3

// 发布配额的统计窗口
export const SYNC_PUBLISH_WINDOW_MS = 60 * 60 * 1000

// 发布配额：单来源 IP 每小时，兜住同一出口下的多设备
export const SYNC_PUBLISH_PER_IP = 12

// 发布速率：全站每分钟，决定内存上界
export const SYNC_PUBLISH_GLOBAL_PER_MINUTE = 100

// 领取失败：单 IP 在窗口内的次数上限
export const SYNC_FAILURE_LIMIT = 8

// 领取失败的统计窗口
export const SYNC_FAILURE_WINDOW_MS = 10 * 60 * 1000

// 触发失败上限后的锁定时长
export const SYNC_LOCK_MS = 15 * 60 * 1000

// 全站失败熔断阈值（每分钟）
export const SYNC_CIRCUIT_FAILURE_LIMIT = 30

// 熔断后暂停发布的时长
export const SYNC_CIRCUIT_MS = 15 * 60 * 1000

// 限流计数的清理间隔
export const SYNC_PRUNE_INTERVAL_MS = 10 * 60 * 1000
