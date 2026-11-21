import { IsObject, IsString, Length } from 'class-validator'

export class PublishSyncDto {
  /** 发布者匿名标识，用于发布配额与云端主键 */
  @IsString({ message: '设备标识格式不正确' })
  @Length(1, 64, { message: '设备标识长度不合法' })
  clientId: string

  /** 简历完整 JSON，至少包含 id */
  @IsObject({ message: '简历数据格式不正确' })
  data: Record<string, any>
}
