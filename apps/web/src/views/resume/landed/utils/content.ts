import { fixed, sentences } from "@/configs";
import { getUUID } from "@/utils";
import { CARD_HEIGHT, CARD_WIDTH, MAX_ROTATE_ANGLE } from "../config";
import { noteQuotes } from "../data/quotes";
import type { NoteItem, NotePosition } from "../types";

const fixedContents = fixed.map((item) => item.value).filter(Boolean); // 首次显示的首推文案
const randomContents = [...new Set([...sentences.map((item) => item.value), ...noteQuotes].filter(Boolean))]; // 合并原短句与本模块语录并去重

// 文案在创建时统一转为字符串；刷新尽量避开当前及本轮已选择的内容。
export const createNote = (position: NotePosition, index: number, previous: NoteItem | null = null, usedContents = new Set<string>()): NoteItem => {
  const alternatives = randomContents.filter((text) => text !== previous?.content);
  const candidates = alternatives.filter((text) => !usedContents.has(text));
  const pool = candidates.length ? candidates : alternatives.length ? alternatives : randomContents;
  const content = !previous && index < fixedContents.length
    ? fixedContents[index]!
    : pool[Math.floor(Math.random() * pool.length)] ?? "";
  usedContents.add(content);
  return {
    id: getUUID(), // 本轮便签唯一标识
    content, // 纯文本便签内容
    type: !previous && index < fixedContents.length ? "fixed" : "random", // 首次首推文案保留强调色
    horizontalRatio: position.horizontalRatio, // 横向分区位置比例
    verticalRatio: position.verticalRatio, // 纵向分区位置比例
    measuredWidth: previous?.measuredWidth ?? CARD_WIDTH, // 实测前使用的宽度估计
    measuredHeight: previous?.measuredHeight ?? CARD_HEIGHT, // 实测前使用的高度估计
    angle: previous?.angle ?? (Math.random() - 0.5) * MAX_ROTATE_ANGLE, // 轮换时保留原倾斜姿态
    visible: false, // 入场前保持透明
    leaving: false, // 当前是否正在离场
    ready: false, // 入场完成后允许轮换
  };
};
