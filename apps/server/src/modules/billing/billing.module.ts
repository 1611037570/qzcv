import { Module } from '@nestjs/common'
import { BillingController } from './billing.controller'
import { BillingPricingService } from './billing-pricing.service'
import { BillingService } from './billing.service'
import { MockPaymentProvider } from './payment/mock-payment.provider'
import { PAYMENT_PROVIDER } from './payment/payment.types'

@Module({
  controllers: [BillingController],
  providers: [
    BillingPricingService,
    BillingService,
    // 模拟渠道同时按自身类型与支付接口令牌注册：
    // 接入真实渠道时新增一个 PaymentProvider 实现，把 PAYMENT_PROVIDER 指过去即可，业务代码不动
    MockPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: MockPaymentProvider },
  ],
  exports: [BillingService, BillingPricingService],
})
export class BillingModule {}
