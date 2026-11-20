import { describe, expect, it, vi } from "vitest";
import { defaultPrompt } from "./defaultPrompt";
import { onDemandSkills } from "./registry";

vi.mock("@/stores", () => ({
  useResumeStore: () => ({ currentData: undefined }),
}));

describe("planningPrompts", () => {
  it("职业规划与人生总结均注册专用技能", async () => {
    // 技能注册与默认任务分派必须同步，避免入口请求回退到无约束回答
    // 按需技能改为懒加载入口，断言前先解析技能
    const skills = await Promise.all(onDemandSkills.map((load) => load()));
    const ids = skills.map((skill) => skill.id);
    const instructions = defaultPrompt().instructions;

    expect(ids).toContain("career_planning");
    expect(ids).toContain("life_summary");
    expect(instructions).toContain("| 职业规划 | career_planning |");
    expect(instructions).toContain("| 人生总结 | life_summary |");
  });
});
