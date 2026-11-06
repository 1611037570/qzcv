import { ANIMATION_MS, CARD_HEIGHT, CARD_WIDTH, CARD_MARGIN, MAX_ROTATE_ANGLE, TOTAL_CARDS } from "../config";
import type { CSSProperties } from "vue";
import type { NoteItem, NotePosition } from "../types";

// 分区只平衡密度，各区可放多张；不改变便签的自然尺寸与展示数量。
export const createCardPositions = (width: number, height: number): NotePosition[] => {
  if (width <= 0 || height <= 0) return [];
  const radians = MAX_ROTATE_ANGLE / 2 * Math.PI / 180;
  const occupiedWidth = CARD_WIDTH * Math.cos(radians) + CARD_HEIGHT * Math.sin(radians);
  const occupiedHeight = CARD_HEIGHT * Math.cos(radians) + CARD_WIDTH * Math.sin(radians);
  const columns = Math.max(1, Math.floor(width / (occupiedWidth + CARD_MARGIN * 2)));
  const rows = Math.max(1, Math.floor(height / (occupiedHeight + CARD_MARGIN * 2)));
  const maxLeft = Math.max(0, width - CARD_WIDTH);
  const maxTop = Math.max(0, height - CARD_HEIGHT);
  const zones = Array.from({ length: columns * rows }, (_, index) => index);
  const positions: NotePosition[] = [];

  // 打乱区域次序，轮流投放到各区，避免先填满某一侧。
  for (let index = zones.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [zones[index], zones[randomIndex]] = [zones[randomIndex]!, zones[index]!];
  }
  for (let index = 0; index < TOTAL_CARDS; index++) {
    const zone = zones[index % zones.length]!;
    const column = zone % columns;
    const row = Math.floor(zone / columns);
    let bestPosition: NotePosition = {
      horizontalRatio: 0.5, // 取样前的横向默认位置
      verticalRatio: 0.5, // 取样前的纵向默认位置
    };
    let bestDistance = -1;

    // 多次取样，优先填补相邻落点间的空隙。
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = {
        horizontalRatio: maxLeft > 0 ? (column + Math.random()) / columns : 0.5, // 横向位置比例
        verticalRatio: maxTop > 0 ? (row + Math.random()) / rows : 0.5, // 纵向位置比例
      };
      let nearestDistance = Infinity;
      for (const position of positions) {
        const distance = ((candidate.horizontalRatio - position.horizontalRatio) * maxLeft / CARD_WIDTH) ** 2
          + ((candidate.verticalRatio - position.verticalRatio) * maxTop / CARD_HEIGHT) ** 2;
        nearestDistance = Math.min(nearestDistance, distance);
      }
      if (nearestDistance > bestDistance) {
        bestPosition = candidate;
        bestDistance = nearestDistance;
      }
    }
    positions.push(bestPosition);
  }
  return positions;
};

// 自动补位重新取点，既与原位置保持明显距离，也尽量填补现有便签间的空隙。
export const createReplacementPosition = (previous: NotePosition, cards: readonly NotePosition[], width: number, height: number): NotePosition => {
  let bestPosition = {
    horizontalRatio: (previous.horizontalRatio + 0.5) % 1, // 取样不足时使用远离原点的横向位置
    verticalRatio: (previous.verticalRatio + 0.5) % 1, // 取样不足时使用远离原点的纵向位置
  };
  let bestDistance = -1;
  for (let attempt = 0; attempt < 32; attempt++) {
    const candidate = {
      horizontalRatio: Math.random(), // 新横向落点比例
      verticalRatio: Math.random(), // 新纵向落点比例
    };
    const movement = Math.hypot(candidate.horizontalRatio - previous.horizontalRatio,
      candidate.verticalRatio - previous.verticalRatio);
    if (movement < 0.25) continue;
    let nearestDistance = Infinity;
    for (const card of cards) {
      const distance = ((candidate.horizontalRatio - card.horizontalRatio) * width / CARD_WIDTH) ** 2
        + ((candidate.verticalRatio - card.verticalRatio) * height / CARD_HEIGHT) ** 2;
      nearestDistance = Math.min(nearestDistance, distance);
    }
    if (nearestDistance > bestDistance) {
      bestPosition = candidate;
      bestDistance = nearestDistance;
    }
  }
  return bestPosition;
};

// 各轴仅为旋转外沿与动画位移保留防裁切空间，不叠加固定边距。
const getAxisPosition = (ratio: number, containerSize: number, cardSize: number, rotatedSize: number, motionInset = 0): number => {
  const inset = Math.max(0, rotatedSize - cardSize) / 2 + motionInset;
  const availableSize = Math.max(0, containerSize - cardSize - inset * 2);
  return Math.min(inset, Math.max(0, (containerSize - cardSize) / 2)) + ratio * availableSize;
};

// 位置、旋转和动效统一计算，首次显示与轮换使用同一套样式。
export const getCardStyle = (card: NoteItem, width: number, height: number): CSSProperties => {
  const radians = Math.abs(card.angle) * Math.PI / 180;
  const rotatedWidth = card.measuredWidth * Math.cos(radians) + card.measuredHeight * Math.sin(radians);
  const rotatedHeight = card.measuredHeight * Math.cos(radians) + card.measuredWidth * Math.sin(radians);
  return {
    left: `${getAxisPosition(card.horizontalRatio, width, card.measuredWidth, rotatedWidth)}px`, // 按实测宽度结算横向落点
    top: `${getAxisPosition(card.verticalRatio, height, card.measuredHeight, rotatedHeight, 6)}px`, // 按实测高度结算纵向落点
    opacity: card.visible ? 1 : 0, // 进出场透明度
    transform: `translateY(${card.visible ? 0 : card.leaving ? -4 : 6}px) rotate(${card.angle}deg) scale(${card.visible ? 1 : 0.97})`, // 保留倾斜与轻微缩放
    transition: `transform ${ANIMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${ANIMATION_MS}ms ease`, // 共用进出场节奏
  };
};
