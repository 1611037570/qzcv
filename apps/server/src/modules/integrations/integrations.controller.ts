import { BadRequestException, Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { IntegrationsService } from './integrations.service'

@ApiTags('第三方集成')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  // 参数与上游异常统一转成请求失败，错误信息里不含上游地址与凭据
  private async run(task: Promise<unknown>) {
    try {
      return await task
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '第三方服务不可用')
    }
  }

  @ApiOperation({ summary: '查询开源仓库星标' })
  @Get('github/stars')
  getGithubStars() {
    return this.run(this.integrationsService.getGithubStars())
  }
}
