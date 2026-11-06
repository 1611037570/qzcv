import { AbortError, isAbortError, prepareContext, type LLM } from "@snowflake/ai";
import { executeToolCall } from "./actor";
import { observe } from "./observer";
import { think } from "./thinker";
import { ToolRegistry } from "./tools";
import { getDefaultToolFailure, isToolErrorResult, toolErrorResult, toolExceptionFailure } from "./failure";
import type { AgentFinalCheck, AgentIssue, AgentRunResult, AgentToolFailure, ChatMessage, ReactConfig } from "./types";

// 通用运行器负责模型与工具循环，业务完成规则由调用方注入。
export const createReactRunner = (model: LLM, config: ReactConfig) => {
    let aborted = false;
    const contextAbort = new AbortController();
    const abortRef: { current: (() => void) | null } = { current: null };
    const registry = new ToolRegistry();
    config.tools.forEach((t) => registry.register(t));

    const abort = () => {
      aborted = true;
      contextAbort.abort();
      abortRef.current?.();
    };

    const runLoop = async (initialMessages: ChatMessage[]): Promise<AgentRunResult> => {
      const maxSteps = config.maxSteps ?? 99;
      // 每次报告修正仍占模型请求轮次，累计修正和相同失败分别计数。
      const finalRetryLimit = config.finalRetryLimit ?? 99;
      const repeatedFailureLimit = config.repeatedFailureLimit ?? 3;
      // 按工具分别记录失败，穿插读取不能清除另一个工具的重复失败。
      const failures = new Map<string, Map<string, number>>();
      const recordFailure = (scope: string, issue: AgentIssue, category = "final") => {
        // 同一工具按类别、编码和目标分别累计，提示文字变化不会重置计数。
        const key = JSON.stringify([category, issue.code, issue.target ?? ""]);
        const scoped = failures.get(scope) ?? new Map<string, number>();
        const count = (scoped.get(key) ?? 0) + 1;
        scoped.set(key, count);
        failures.set(scope, scoped);
        return count >= repeatedFailureLimit;
      };
      let history: ChatMessage[] = [...initialMessages];
      const traceId = model.observer.createLlmTrace({
        provider: model.provider,
        model: config.model || model.model,
        input: initialMessages,
      });
      let activeRound: { round: number; startTime: number } | null = null;
      let lastIncompleteReason: AgentIssue | undefined;
      let lastToolFailure: AgentToolFailure | undefined;
      let steps = 0;
      let finalRetries = 0;

      // 统一记录每轮结束时间与耗时，异常和取消同样保留本轮数据
      const finishActiveRound = (status: "success" | "error" | "aborted" = "success") => {
        if (!activeRound) return;
        const endTime = Date.now();
        model.observer.recordLlmTraceEvent(traceId, "round_complete", {
          round: activeRound.round,
          startTime: activeRound.startTime,
          endTime,
          durationMs: endTime - activeRound.startTime,
          status,
        });
        activeRound = null;
      };
      // 退出不再请求模型，交给业务层保留已完成结果并说明停止原因。
      const finishIncomplete = async (reason: AgentIssue, toolFailure?: AgentToolFailure): Promise<AgentRunResult> => {
        const answer = config.onIncomplete ? await config.onIncomplete(reason) : reason.message;
        if (aborted) throw new AbortError();
        const result: AgentRunResult = {
          status: "incomplete", // 轮次或重试停止不冒充任务完成。
          answer, // 业务层说明保留已经生效的结果。
          reason, // 独立停止原因供页面与任务入口读取。
          steps, // 实际请求轮数。
          toolFailure, // 导致自动停止的工具失败。
        };
        finishActiveRound("error");
        model.observer.finishLlmTrace(traceId, "error", reason.message);
        return result;
      };

      try {
        // 打印 ReAct 运行过程，便于观察每一步发生了什么
        console.log("[ReAct] 开始运行，消息数:", initialMessages.length, "最大步数:", maxSteps);

        for (let step = 0; step < maxSteps; step++) {
          if (aborted) throw new AbortError();

          const round = step + 1;
          steps = round;
          activeRound = { round, startTime: Date.now() };
          model.observer.recordLlmTraceEvent(traceId, "round_start", { round });
          console.log(`[ReAct] 第 ${round}/${maxSteps} 步 Think`);
          // 每轮推理前只压缩请求历史副本，不修改调用方保存的原始消息。
          if (config.context) {
            history = await prepareContext(history, {
              ...config.context,
              signal: contextAbort.signal,
            });
          }
          if (aborted) throw new AbortError();
          // 宿主可按轮次裁剪工具声明，首轮只发本轮会用到的工具。
          const roundTools = config.resolveTools?.(step) ?? config.tools;
          const result = await think(model, history, {
            tools: roundTools,
            // 仅首轮强制调用宿主指定的起始工具，后续交由 ReAct 决定。
            toolChoice: step === 0 ? config.initialTool : undefined,
            model: config.model,
            thinking: config.thinking,
            abortRef,
            onEvent: config.onEvent,
            onReasoning: config.onReasoning,
            onContent: config.onContent,
            onToken: config.onToken,
            traceId,
          });

          if (aborted) throw new AbortError();

          if (result.reasoning) console.log("[ReAct] 思考:", result.reasoning);
          console.log("[ReAct] 工具调用:", result.toolCalls);

          config.onThink?.(result.reasoning);

          // 无工具调用时，校验任务完成条件后直接返回最终答案。
          if (!result.toolCalls.length) {
            // 最终回答原样交给业务校验：裁切花括号之间的内容会截断含 JSON 片段的普通回答
            const finalAnswer = result.finalAnswer;

            // 业务运行时可依据工具证据拒绝过早收口，反馈仍留在同一个 ReAct 历史中继续处理。
            const verdict: AgentFinalCheck = config.beforeFinal ? await config.beforeFinal(finalAnswer) : { status: "completed" };
            if (aborted) throw new AbortError();
            if (verdict.status === "retry") {
                const retryReason = verdict.issue;
                lastIncompleteReason = retryReason;
                // 不同问题允许继续修正，相同问题达到上限立即退出。
                finalRetries += 1;
                if (recordFailure("final", retryReason)) {
                  return await finishIncomplete({
                    code: "repeated_failure", // 相同完成条件反复失败。
                    target: retryReason.code, // 保留具体未满足的条件编码。
                    message: `同一问题已连续失败 ${repeatedFailureLimit} 次，已停止自动重试：${retryReason.message}`, // 最新修正说明。
                  });
                }
                if (step >= maxSteps - 1 || finalRetries > finalRetryLimit) {
                  return await finishIncomplete({
                    code: step >= maxSteps - 1 ? "max_steps" : "final_retry_limit", // 区分总轮次与完成检查次数耗尽。
                    target: retryReason.code, // 保留当前未满足条件。
                    message: retryReason.message, // 保留业务未完成说明。
                  });
                }
                history.push({ role: "assistant", content: result.finalAnswer });
                history.push({ role: "system", content: retryReason.message });
                config.onFinalRetry?.(retryReason.message);
                finishActiveRound();
                continue;
              }

            console.log("[ReAct] 最终答案:", finalAnswer);
            const runResult: AgentRunResult = {
              status: verdict.status, // 业务决定完成、等待补充或阻塞。
              answer: finalAnswer, // 通过业务结束检查的回答。
              reason: verdict.reason, // 等待或阻塞的具体原因。
              steps, // 实际请求轮数。
            };
            finishActiveRound();
            model.observer.finishLlmTrace(traceId, "success");
            return runResult;
          }

          // 回填 assistant 的工具调用消息
          history.push({
            role: "assistant",
            content: null,
            tool_calls: result.toolCalls,
          });
          model.observer.updateLlmTraceStatus(traceId, "tool_calling");

          for (const toolCall of result.toolCalls) {
            if (aborted) throw new AbortError();

            console.log(
              "[ReAct] 执行工具:",
              toolCall.function.name,
              "参数:",
              toolCall.function.arguments,
            );
            model.observer.recordLlmTraceEvent(traceId, "tool_call", { round, toolCall });
            config.onAct?.(toolCall);
            let raw: unknown;
            let executionError: unknown;
            try {
              raw = await executeToolCall(registry, toolCall);
            } catch (error) {
              // 取消不经过业务恢复；其它异常统一分类，宿主仍可补充工具指引。
              if (aborted || isAbortError(error)) throw error;
              const fallback = config.onToolError?.({ toolCall, error: error as Error, tools: config.tools });
              const failure = toolExceptionFailure(error, fallback !== undefined);
              raw = toolErrorResult(failure, fallback);
              if (!failure.retryable) executionError = error;
            }
            if (aborted) throw new AbortError();
            // 参数与执行错误直接使用统一契约；业务结果保留原值用于证据与部分成功判断。
            const failure = isToolErrorResult(raw) ? raw.failure
              : config.getToolFailure?.(toolCall, raw) ?? getDefaultToolFailure(raw);
            const observationValue = failure && !isToolErrorResult(raw) ? toolErrorResult(failure, raw) : raw;
            const observation = observe(toolCall, observationValue);
            // 观察结果可能包含整份简历，截断打印避免刷屏
            const observePreview =
              observation.content.length > 2000
                ? observation.content.slice(0, 2000) + "..."
                : observation.content;
            console.log(
              "[ReAct] 观察结果(" + observation.content.length + "字符):",
              observePreview,
            );
            model.observer.recordLlmTraceEvent(traceId, "tool_result", { round, observation });
            // 回传从一开始的 ReAct 轮次，供宿主标注观测过程
            config.onObserve?.(observation, round);

            history.push({
              role: "tool",
              content: observation.content,
              tool_call_id: observation.toolCallId,
            });
            const failureKey = `tool:${toolCall.function.name}`;
            if (failure) {
              if (!failure.retryable) {
                lastToolFailure = failure;
                throw executionError ?? new Error(failure.message);
              }
              if (recordFailure(failureKey, failure, failure.category)) {
                return await finishIncomplete({
                  code: "repeated_failure", // 同一工具、类别与目标达到失败上限。
                  target: toolCall.function.name, // 标识停止的工具。
                  message: `同一问题已连续失败 ${repeatedFailureLimit} 次，已停止自动重试：${toolCall.function.name}，${failure.message}`, // 保留最新失败说明。
                }, failure);
              }
            } else failures.delete(failureKey);
          }
          finishActiveRound();
        }

        console.warn("[ReAct] 超出最大步数");
        return await finishIncomplete({
          code: "max_steps", // 总执行轮次耗尽。
          message: lastIncompleteReason?.message || "执行轮次已用完，尚未生成通过校验的最终回答。", // 保留最后的业务校验原因。
        });
      } catch (error) {
        const message = String((error as any)?.message || "ReAct 执行失败");
        const status = aborted || isAbortError(error) ? "aborted" : "error";
        finishActiveRound(status);
        model.observer.finishLlmTrace(traceId, status, message);
        const result: AgentRunResult = {
          status, // 取消与执行异常明确分开。
          answer: "", // 不把流式候选当成已经验收的回答。
          steps, // 中断前开始的轮数。
          reason: { code: status === "aborted" ? "aborted" : "execution_error", message /* 原始错误说明。 */ }, // 稳定停止原因。
          error, // 保留宿主既有异常展示所需的原对象。
          toolFailure: lastToolFailure, // 执行异常发生在工具时保留分类信息。
        };
        return result;
      }
    };

    // 宿主结束回调只执行一次，回调异常不重新进入循环的错误收口。
    const run = async (messages: ChatMessage[]): Promise<AgentRunResult> => {
      const result = await runLoop(messages);
      config.onFinal?.(result);
      return result;
    };

    return { abort, run };
};
