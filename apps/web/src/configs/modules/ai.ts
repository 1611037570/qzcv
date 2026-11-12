import { env } from "../env";
// 服务商展示名映射（用于无别名且无模型名时的兜底展示）
export const PROVIDER_NAMES: Record<string, string> = {
  snowflake: "雪花服务",
  openai: "OpenAI / 兼容服务", // 官方接口及兼容服务入口。
  ark: "豆包 / 火山方舟", // 保留既有 Ark 标识以兼容已保存配置。
  deepseek: "DeepSeek",
  gemini: "Gemini", // Google Gemini 兼容接口。
  claude: "Claude", // Claude 官方兼容接口。
  qwen: "千问 Qwen", // 阿里云百炼兼容接口。
  zhipu: "智谱 GLM", // 智谱开放平台。
  moonshot: "月之暗面 Kimi", // 月之暗面开放平台。
};

// 本站服务端根地址，去掉结尾斜杠避免拼出双斜杠
const apiRoot = env.apiBaseUrl.replace(/\/+$/, "");

// 内置雪花服务配置：全部请求经本站服务端转发，浏览器不再持有上游密钥
export const snowflake = {
  // 未配置站点接口地址时退回同源地址，保证内置模型始终可用，配置问题只体现为请求失败
  baseUrl: `${apiRoot}/llm/stream`, // 服务端流式转发接口的完整地址
  provider: "snowflake", // 对应 PROVIDER_NAMES 中的雪花服务
  apiKey: "builtin", // 占位密钥，服务端只使用自身配置的上游密钥
  model: "snowflake", // 占位模型名，实际模型由服务端配置覆盖
  protocol: "chatCompletions" as const, // 与上游保持对话补全协议
};

// 平台内置模型的用途标识：服务端按 "snowflake:<用途>" 读取 OPENAI_MODEL_<用途>。
// 增加用途时只需在这里加一项，并在服务端 .env 补同名变量，服务端没有需要同步的常量。
export const SNOWFLAKE_MODELS = {
  assistant: "snowflake:assistant", // 助手对话与面试使用，对应 OPENAI_MODEL_ASSISTANT
  parser: "snowflake:parser", // 导入简历解析使用，对应 OPENAI_MODEL_PARSER
};
