import { describe, expect, it, vi } from "vitest";
import { defaultPrompt } from "./routing/defaultPrompt";

vi.mock("@/stores", () => ({
  useResumeStore: () => ({ selectedModule: [], currentData: undefined }),
}));

// 依赖完整经历或连续规则的任务必须保持稳定上下文
describe("promptScope", () => {
  it("要求多轮任务持续加载原任务技能", () => {
    expect(defaultPrompt().instructions).toContain("均属于该任务的续轮");
    expect(defaultPrompt().instructions).toContain("每一轮都必须重新调用同一任务技能");
  });
});
