// 模型请求使用的消息与工具调用结构。
// 模型输出的一次工具调用
export interface ToolCall {
  // 调用唯一标识，回填 tool 消息时使用
  id: string;
  // 函数类型，openai 协议固定为 function
  type: string;
  // 服务商返回的工具扩展元数据，下一轮原样回传以保留思考签名。
  extra_content?: Record<string, unknown>;
  function: { // 工具函数名称与参数。
    // 工具名
    name: string;
    // 参数 JSON 字符串，流式分片累积后拼接
    arguments: string;
  };
}

// 组装给模型的聊天消息
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"; // 消息所属角色。
  content: string | null; // 消息正文。
  tool_calls?: ToolCall[]; // 助手发起的工具调用。
  tool_call_id?: string; // 工具结果对应的调用标识。
}
