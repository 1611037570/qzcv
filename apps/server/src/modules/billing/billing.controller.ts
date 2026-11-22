import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common'
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { resolveClientIdentity } from '../shared/client-identity'
import { BillingService } from './billing.service'
import { CreateOrderDto } from './dto/create-order.dto'

// 带原始请求体的请求：支付回调验签必须使用未经反序列化的字节
type RawBodyRequest = Request & { rawBody?: Buffer }

// 访问凭证请求头：余额只归属于凭证本身，与 IP、设备标识无关
const LICENSE_HEADER = 'x-license-key'

@ApiTags('充值计费')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @ApiOperation({ summary: '读取定价与套餐，不需要凭证也不依赖数据库' })
  @Get('catalog')
  catalog() {
    return this.billingService.getCatalog()
  }

  @ApiOperation({ summary: '读取凭证余额与最近流水' })
  @ApiHeader({ name: LICENSE_HEADER, required: false, description: '访问凭证，不传时返回未激活状态' })
  @Get('wallet')
  wallet(@Headers(LICENSE_HEADER) licenseKey?: string) {
    return this.billingService.getWallet(licenseKey)
  }

  @ApiOperation({ summary: '读取令牌流水' })
  @ApiHeader({ name: LICENSE_HEADER, required: true, description: '访问凭证' })
  @Get('ledger')
  ledger(@Headers(LICENSE_HEADER) licenseKey: string | undefined, @Query('limit') limit?: string) {
    if (!licenseKey) throw new BadRequestException('缺少凭证')
    return this.billingService.listLedger(licenseKey, Number(limit))
  }

  @ApiOperation({ summary: '创建充值订单，带凭证时续充到该凭证' })
  @ApiHeader({ name: LICENSE_HEADER, required: false, description: '已有凭证，传入表示续充而不是签发新凭证' })
  @HttpCode(HttpStatus.OK)
  @Post('orders')
  createOrder(@Req() req: Request, @Body() dto: CreateOrderDto, @Headers(LICENSE_HEADER) licenseKey?: string) {
    // 订单限流只按来源 IP，不参与余额归属
    return this.billingService.createOrder(resolveClientIdentity(req).ipHash, dto.packageId, licenseKey)
  }

  @ApiOperation({ summary: '查询充值订单状态' })
  @Get('orders/:orderNo')
  order(@Req() req: Request, @Param('orderNo') orderNo: string) {
    return this.billingService.getOrder(orderNo, resolveClientIdentity(req).ipHash)
  }

  @ApiOperation({ summary: '模拟支付：仅未接入真实渠道时可用，凭证只在本次响应返回一次' })
  @HttpCode(HttpStatus.OK)
  @Post('orders/:orderNo/simulate-pay')
  simulatePay(@Req() req: Request, @Param('orderNo') orderNo: string) {
    return this.billingService.simulatePayment(orderNo, resolveClientIdentity(req).ipHash)
  }

  // 真实支付渠道的对接位置：渠道侧配置该地址后，把 verify 换成渠道验签实现即可
  @ApiOperation({ summary: '支付渠道异步回调' })
  @HttpCode(HttpStatus.OK)
  @Post('payments/:channel/callback')
  callback(@Param('channel') channel: string, @Req() req: RawBodyRequest) {
    if (!req.rawBody) throw new BadRequestException('缺少原始请求体，无法验签')
    return this.billingService.handleCallback(channel, req.rawBody, req.headers)
  }
}
