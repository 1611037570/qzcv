import { config } from "@/configs";
import XyRequest from "../../request";

const request = new XyRequest({
  baseURL: config.api.baseUrl,
});

// 发布结果：服务端内存中转成功后返回的取件信息
export interface ResumeSyncPublishResult {
  code: string; // 6 位取件码，大写字母与数字组成
  expiresAt: number; // 失效时间戳（毫秒），首次领取或超时后失效
}

// 领取结果：取回即销毁，响应里只带这一次的简历正文
export interface ResumeSyncFetchResult {
  data: Record<string, any>; // 完整简历 JSON，含 config、data、ui 与 usage
}

// 发布简历到内存中转，超出体积上限由服务端拒绝
export const publishResumeSync = async (clientId: string, data: Record<string, any>) => {
  const response = await request.post({
    url: "/sync",
    data: { clientId, data },
    // 单条最大 4MB，默认 10 秒在慢网络下会误判超时
    timeout: 30000,
  });
  // 请求拦截器会返回错误对象，这里统一转为拒绝
  if (response instanceof Error || response?.isAxiosError) throw response;
  return response as ResumeSyncPublishResult;
};

// 凭 6 位码领取简历，服务端返回后立即销毁该条记录
export const fetchResumeSync = async (code: string) => {
  const response = await request.post({
    url: "/sync/fetch",
    data: { code },
    timeout: 30000,
  });
  if (response instanceof Error || response?.isAxiosError) throw response;
  return response as ResumeSyncFetchResult;
};
