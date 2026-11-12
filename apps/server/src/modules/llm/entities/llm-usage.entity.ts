import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity('llm_usage')
export class LlmUsage {
  @PrimaryGeneratedColumn({ comment: '主键', type: 'bigint' })
  id: string

  // 没有账号体系，用浏览器信息推导的稳定标识区分不同使用者，作为后续免费额度的归属依据
  @Index()
  @Column({ name: 'client_key', length: 64, default: '', comment: '使用者标识，由 IP 与设备标识推导' })
  clientKey: string

  // 只保存哈希值，不落明文地址
  @Column({ name: 'ip_hash', length: 64, default: '', comment: '来源 IP 的哈希值' })
  ipHash: string

  @Column({ length: 64, default: '', comment: '本次实际使用的上游模型' })
  model: string

  @Column({ name: 'prompt_tokens', type: 'int', unsigned: true, default: 0, comment: '输入消耗令牌数' })
  promptTokens: number

  @Column({ name: 'completion_tokens', type: 'int', unsigned: true, default: 0, comment: '输出消耗令牌数' })
  completionTokens: number

  @Column({ name: 'total_tokens', type: 'int', unsigned: true, default: 0, comment: '本次消耗令牌总数' })
  totalTokens: number

  // 上游未回传用量时标记为估算，避免与真实计量混为一谈
  @Column({ type: 'tinyint', default: 0, comment: '是否为估算值：0 上游计量 1 本地估算' })
  estimated: number

  @Index()
  @CreateDateColumn({ name: 'created_at', comment: '记录时间' })
  createdAt: Date
}
