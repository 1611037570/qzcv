import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

// 创建充值订单入参：只提交套餐标识，金额与到账令牌一律由服务端套餐配置决定
export class CreateOrderDto {
  @IsString({ message: '套餐标识必须为字符串' })
  @IsNotEmpty({ message: '套餐标识不能为空' })
  @MaxLength(32, { message: '套餐标识长度不能超过 32 个字符' })
  packageId: string
}
