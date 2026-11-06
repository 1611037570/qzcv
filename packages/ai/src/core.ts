import { createRequest } from "./request/request.js";
import { prepareProviderOptions } from "./request/providers.js";
import { AbortError } from "./errors.js";
import { noopLlmObserver, type LlmObserver } from "./observer.js";


// 组装请求体：强制开启流式响应
function processOption({ options }: any) {
  return JSON.stringify({
    ...options,
    stream: true, // 强制开启流式响应
  });
}

// 单次模型请求保留原有参数结构，并为独立输出回调提供明确类型。
export type LLMRequestConfig = {
  options?: Record<string, any>;
  onSuccess?: (result: any) => void;
  onFail?: (error: any) => void;
  onEvent?: (type: string, data: any) => void;
  onReasoning?: (delta: string) => void;
  onContent?: (delta: string) => void;
  onToken?: (totalTokens: number) => void;
  onFinally?: () => void;
  isDebug?: boolean;
  isJson?: boolean;
  method?: string;
  retryCount?: number;
  isStream?: boolean;
  timeout?: number;
  traceId?: string;
  deferTraceFinish?: boolean;
};

/**
 * LLM 类用于管理与大语言模型的流式和非流式请求。
 * 支持多种 AI 供应商，提供重试机制和错误处理功能。
 */
class LLM {
  // 观测能力由宿主注入，保持包不依赖界面与持久化实现。
  observer: LlmObserver;
  /** @type {string} 完整的请求地址 */
  url;
  /** @type {string} AI 供应商标识，如 'cool' 等 */
  provider;
  /** @type {string|undefined} 请求认证所需的 API Key */
  apiKey;
  /** @type {string|undefined} 默认模型名，request 时自动注入 */
  model;
  /** @type {string} 接口协议类型 */
  protocol;
  /**
   * 初始化 LLM 实例
   * @param {Object} config - 配置对象
   * @param {string} [config.url=""] - 完整的请求地址
   * @param {string} [config.provider="cool"] - AI 供应商标识，如 'cool' 等
   * @param {string} [config.apiKey] - 请求认证所需的 API Key
   * @param {string} [config.model] - 默认模型名
   */
  constructor(config: {
    url?: string;
    provider?: string;
    apiKey?: string;
    model?: string;
    protocol?: "chatCompletions" | "responses";
    observer?: LlmObserver;
  }) {
    const { url = "", provider = "cool", apiKey, model, protocol = "chatCompletions", observer = noopLlmObserver } = config;

    this.url = url;
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model;
    this.protocol = protocol;
    this.observer = observer;

    // 校验配置完整性，任一缺失时输出警告
    if (!this.url || !this.provider || !this.apiKey || !this.model) {
      console.warn("LLM 配置缺失，请检查！！！");
    }
  }
  /**
   * 发送平台对应的最小请求，检查模型连接是否可用
   */
  async ping() {
    const options: any = {
      thinking: { type: "disabled" },
    };
    if (this.protocol === "chatCompletions") {
      options["messages"] = [{ role: "user", content: "连接测试，请回复 OK" }];
    } else if (this.protocol === "responses") {
      options["input"] = [{ role: "user", content: "连接测试，请回复 OK" }];
    }
    const { sendFn } = await this.request({
      options,
      isStream: true,
      isJson: false,
      isDebug: false,
      // 连接测试允许重试：不累积流内容，重试不会造成拼接
      retryCount: 3,
    });
    return sendFn();
  }
  /**
   * 创建并执行 AI 请求任务
   * @param {Object} config - 请求配置对象
   * @param {Object} [config.options={}] - 接口请求参数，包含请求所需的各种参数
   * @param {Function} [config.onSuccess] - 请求成功回调函数，接收解析后的结果
   * @param {Function} [config.onFail] - 请求失败回调函数，接收错误对象
   * @param {Function} [config.onEvent] - 通用事件回调函数，接收事件类型和数据
   * @param {Function} [config.onReasoning] - 思考内容增量回调
   * @param {Function} [config.onContent] - 回答内容增量回调
   * @param {Function} [config.onToken] - 总令牌数回调
   * @param {Function} [config.onFinally] - 请求结束回调函数（无论成功或失败）
   * @param {boolean} [config.isDebug=true] - 是否开启调试模式，开启后会打印请求日志
   * @param {boolean} [config.isJson=true] - 接口返回数据是否为 JSON 格式
   * @param {string} [config.method="POST"] - 请求方法，默认为 POST
   * @param {number} [config.retryCount=3] - 请求失败时的重试次数；流式请求默认不重试
   * @param {number} [config.timeout=300000] - 请求超时时间，默认 5 分钟
   * @param {boolean} [config.isStream=true] - 是否开启流式响应
   * @returns {Promise<any>} 返回请求结果的 Promise，包含 abortFn 和 sendFn
   */
  async request(config: LLMRequestConfig) {
    const {
      options = {},
      onSuccess,
      onFail,
      onEvent,
      onReasoning,
      onContent,
      onToken,
      onFinally,
      isDebug = true,
      isJson = true,
      method = "POST",
      retryCount,
      isStream = true,
      timeout = 300000,
      traceId: parentTraceId,
      deferTraceFinish = false,
    } = config;
    // 流式增量无法回滚，重试会把上一轮的正文与工具参数重复拼进调用方累积器
    const retryAttempts = retryCount ?? (isStream ? 0 : 3);
    const token = this.apiKey || "";
    if (isDebug) {
      console.log("请求配置 :>> ", config);
    }

    // 默认模型由实例注入
    const requestOptions = prepareProviderOptions(this.provider, this.protocol, {
      ...options,
      model: this.model,
      // 已配置的聊天补全服务商共用流式用量参数，其他协议不附加该参数。
      ...(isStream && this.protocol === "chatCompletions" && ["openai", "deepseek", "ark", "gemini", "claude", "qwen"].includes(this.provider)
        ? {
            stream_options: {
              ...options.stream_options,
              include_usage: true,
            },
          }
        : {}),
    });
    // Create a trace only when the request is not part of a parent workflow.
    const traceId =
      parentTraceId ||
      this.observer.createLlmTrace({
        provider: this.provider,
        model: requestOptions.model,
        input: requestOptions,
      });

    // 模型正文、思考和令牌统计走独立回调，通用事件只透传其他事件。
    const handleEvent = (type: string, data: any) => {
      if (type === "reasoning") {
        this.observer.appendLlmTraceReasoning(traceId, data);
        onReasoning?.(data);
      } else if (type === "content") {
        this.observer.appendLlmTraceOutput(traceId, data);
        onContent?.(data);
      } else if (type === "total_tokens") {
        this.observer.updateLlmTraceUsage(traceId, data);
        onToken?.(data);
      } else if (type === "usage") {
        this.observer.updateLlmTraceUsage(traceId, data);
      } else {
        onEvent?.(type, data);
      }
    };

    // 提前创建处理器，确保调用方在 sendFn 执行前即可获取 abort
    const handler = createRequest(token, isStream, {
      onRequest: () => this.observer.recordLlmTraceEvent(traceId, "request"),
      onResponse: (status) => this.observer.recordLlmTraceEvent(traceId, "response", { status }),
      onFirstToken: () => this.observer.markLlmTraceFirstToken(traceId),
      onError: (error) =>
        this.observer.recordLlmTraceEvent(traceId, "error", (error as Error)?.message || "请求失败"),
    });
    const send = handler.send;
    const abort = handler.abort;

    // 发送函数：失败按重试次数循环重试，4xx 客户端错误（429 除外）不再重试
    const sendFn = async () => {
      try {
        this.observer.updateLlmTraceStatus(traceId, "requesting");
        for (let attempt = 1; ; attempt++) {
          try {
            // 组装请求基础配置
            const requestConfig = {
              url: this.url,
              method,
              isDebug,
              provider: this.provider,
              protocol: this.protocol,
              timeout,
              traceId,
            };

            // 流式与非流式请求体不同，分别组装后发送
            const res = isStream
              ? await send({
                  ...requestConfig,
                  data: processOption({ options: requestOptions }),
                  isJson,
                  onEvent: handleEvent,
                })
              : await send({
                  ...requestConfig,
                  data: JSON.stringify(requestOptions),
                });
            // 主动中止时不触发成功回调
            if (!res?.aborted) {
              onSuccess?.(res);
              if (!isStream) this.observer.setLlmTraceOutput(traceId, res);
              if (!deferTraceFinish) this.observer.finishLlmTrace(traceId, "success");
            } else if (!deferTraceFinish) {
              this.observer.finishLlmTrace(traceId, "aborted");
            }
            return res;
          } catch (e: any) {
            // 判断是否可重试：4xx 客户端错误（429 限流除外）重试无意义
            const status = e?.status;
            const retryable = !(status && status >= 400 && status < 500 && status !== 429);
            // 尝试次数耗尽或不可重试时，跳出循环按最终失败处理
            if (attempt > retryAttempts || !retryable) {
              throw e;
            }
            const delay = 500 * attempt;
            this.observer.recordLlmTraceEvent(traceId, "retry", { attempt, delay });
            if (isDebug) {
              console.warn(
                `请求失败，准备在 ${delay}ms 后进行第 ${attempt}/${retryAttempts} 次重试...`,
              );
            }
            // 等待指定时间后进入下一次尝试
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      } catch (e) {
        const message = String((e as any)?.message || "请求失败");
        if (!deferTraceFinish) {
          this.observer.finishLlmTrace(traceId, message.includes("请求超时") ? "timeout" : "error", message);
        }
        onFail?.(e);
        // 统一错误处理
        if (isDebug) {
          console.error("请求失败 :>> ", e);
        }
        throw e;
      } finally {
        // 无论成功或重试耗尽，结束回调仅触发一次
        onFinally?.();
      }
    };

    return {
      abortFn: abort,
      sendFn,
      traceId,
    };
  }

}

export { LLM };
