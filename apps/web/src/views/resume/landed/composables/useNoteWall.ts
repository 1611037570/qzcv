import { nextTick, onScopeDispose, ref, shallowRef, watch } from "vue";
import { useElementSize } from "@vueuse/core";
import { ANIMATION_MS, ENTER_STAGGER_MS, MIN_STAY_MS, MAX_STAY_MS, ROTATION_COUNT } from "../config";
import { createNote } from "../utils/content";
import { createCardPositions, createReplacementPosition, getCardStyle } from "../utils/layout";
import type { NoteItem } from "../types";

// 同时兼容项目声明中的浏览器与节点定时器类型。
type TimerId = ReturnType<typeof setTimeout>;

// 仅供便签墙使用，管理初始化、每轮少量异位轮换与手动整墙刷新。
export const useNoteWall = () => {
  const container = ref<HTMLDivElement | null>(null); // 便签墙容器
  const { width, height } = useElementSize(container);
  const cards = shallowRef<NoteItem[]>([]); // 当前便签列表
  const isRefreshing = ref(false); // 初始化或手动整墙刷新状态
  const topId = ref(""); // 点击后置顶的便签标识
  const pausedIds = new Set<string>(); // 悬停阅读时保留的便签
  const timers = new Set<TimerId>(); // 所有待清理的动画与轮换任务
  let rotationTimer: TimerId | null = null; // 整面墙唯一的自动轮换计时器
  const departureTimers = new Map<string, TimerId>(); // 各自动轮换便签可单独撤销的离场任务
  const rotatingIds = new Set<string>(); // 本轮尚未完成离场或补位的便签
  let version = 0; // 隔离手动刷新前后的异步动画
  let disposed = false; // 页面卸载后终止异步处理
  let initialized = false; // 容器尺寸就绪后只初始化一次

  const cancelTimer = (timer: TimerId | null) => {
    if (timer === null) return;
    clearTimeout(timer);
    timers.delete(timer);
  };
  const schedule = (callback: () => void, delay: number): TimerId => {
    const currentVersion = version;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed && currentVersion === version) callback();
    }, delay);
    timers.add(timer);
    return timer;
  };
  const clearTimers = () => {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    rotationTimer = null;
    departureTimers.clear();
    rotatingIds.clear();
  };
  onScopeDispose(() => {
    disposed = true;
    version++;
    clearTimers();
    pausedIds.clear();
  });

  const updateCard = (id: string, changes: Partial<NoteItem>) => {
    cards.value = cards.value.map((card) => card.id === id ? { ...card, ...changes } : card);
  };
  const setCardSize = (id: string, cardWidth: number, cardHeight: number) => {
    const card = cards.value.find((item) => item.id === id);
    if (!card || (card.measuredWidth === cardWidth && card.measuredHeight === cardHeight)) return;
    updateCard(id, {
      measuredWidth: cardWidth, // 内容实际宽度
      measuredHeight: cardHeight, // 内容实际高度
    });
  };

  // 单张补位立即入场，多张初始化与手动刷新沿用短暂错开的柔和入场。
  const enterCards = async (ids: readonly string[], onComplete: () => void): Promise<void> => {
    const currentVersion = version;
    await nextTick();
    await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    if (disposed || currentVersion !== version) return;
    if (!ids.length) {
      onComplete();
      return;
    }
    let remaining = ids.length;
    ids.forEach((id) => {
      const reveal = () => {
        updateCard(id, { visible: true }); // 显示便签并触发原地淡入
        schedule(() => {
          updateCard(id, { ready: true }); // 完整入场后允许自动轮换
          remaining--;
          if (remaining === 0) onComplete();
        }, ANIMATION_MS);
      };
      if (ids.length === 1) reveal();
      else schedule(reveal, Math.random() * ENTER_STAGGER_MS);
    });
  };

  // 自动轮换只使用整面墙的一个计时器，保留明确的静止阅读时段。
  const scheduleRotation = () => {
    if (disposed || isRefreshing.value || rotationTimer !== null || rotatingIds.size) return;
    rotationTimer = schedule(() => {
      rotationTimer = null;
      rotateCards();
    }, MIN_STAY_MS + Math.random() * (MAX_STAY_MS - MIN_STAY_MS));
  };
  const finishRotation = (id: string) => {
    rotatingIds.delete(id);
    scheduleRotation();
  };
  const rotateCards = () => {
    if (disposed || isRefreshing.value || rotatingIds.size) return;
    const candidates = cards.value.filter((card) => card.ready && card.visible
      && !card.leaving && !pausedIds.has(card.id));
    if (!candidates.length) {
      scheduleRotation();
      return;
    }
    const selected: NoteItem[] = [];
    while (selected.length < ROTATION_COUNT && candidates.length) {
      const [card] = candidates.splice(Math.floor(Math.random() * candidates.length), 1);
      if (!card) break;
      selected.push(card);
      rotatingIds.add(card.id);
    }
    selected.forEach(replaceCard);
  };

  // 每张独立离场与补位，整轮结束才重新计时；两张中任一悬停不影响另一张。
  const replaceCard = (card: NoteItem) => {
    updateCard(card.id, { visible: false, leaving: true }); // 本轮便签缓慢淡出
    const timer = schedule(() => {
      departureTimers.delete(card.id);
      const current = cards.value.find((item) => item.id === card.id);
      if (!current || pausedIds.has(card.id)) {
        if (current) updateCard(card.id, { visible: true, leaving: false }); // 保留正在阅读的便签
        finishRotation(card.id);
        return;
      }
      const usedContents = new Set(cards.value.map((item) => item.content));
      const neighbors = cards.value.filter((item) => item.id !== card.id);
      const position = createReplacementPosition(current, neighbors, width.value, height.value);
      const replacement = createNote(position, 0, current, usedContents);
      cards.value = cards.value.map((item) => item.id === card.id ? replacement : item);
      if (topId.value === card.id) topId.value = "";
      enterCards([replacement.id], () => finishRotation(card.id));
    }, ANIMATION_MS);
    departureTimers.set(card.id, timer);
  };

  // 悬停可撤销刚触发的离场；手动刷新也会保留当时仍在阅读的便签。
  const setPaused = (id: string, paused: boolean) => {
    if (!paused) {
      pausedIds.delete(id);
      return;
    }
    pausedIds.add(id);
    const card = cards.value.find((item) => item.id === id);
    if (card?.leaving) updateCard(id, { visible: true, leaving: false }); // 恢复当前阅读内容
    const timer = departureTimers.get(id);
    if (timer === undefined) return;
    cancelTimer(timer);
    departureTimers.delete(id);
    finishRotation(id);
  };

  const initialize = () => {
    isRefreshing.value = true;
    const usedContents = new Set<string>(); // 首次展示也从扩充后的语录池随机取用，避免同屏重复
    cards.value = createCardPositions(width.value, height.value)
      .map((position, index) => createNote(position, index, null, usedContents));
    enterCards(cards.value.map((card) => card.id), () => {
      isRefreshing.value = false;
      scheduleRotation();
    });
  };

  // 按钮明确更新整面墙内容与落点，取消旧轮换，不再随机换一张或静默跳过。
  const refresh = () => {
    if (disposed || isRefreshing.value || !cards.value.length) return;
    isRefreshing.value = true;
    version++;
    clearTimers();
    cards.value = cards.value.map((card) => ({
      ...card,
      visible: pausedIds.has(card.id), // 悬停内容保留，其余便签淡出
      leaving: !pausedIds.has(card.id), // 手动刷新共用原地离场效果
      ready: pausedIds.has(card.id), // 未刷新便签维持可阅读状态
    }));
    schedule(() => {
      const positions = createCardPositions(width.value, height.value);
      const usedContents = new Set(cards.value.filter((card) => pausedIds.has(card.id)).map((card) => card.content));
      const enteringIds: string[] = [];
      cards.value = cards.value.map((card, index) => {
        if (pausedIds.has(card.id)) {
          return { ...card, visible: true, leaving: false, ready: true }; // 保留悬停便签及原位置
        }
        const replacement = createNote(positions[index] || card, index, card, usedContents);
        enteringIds.push(replacement.id);
        return replacement;
      });
      const currentIds = new Set(cards.value.map((card) => card.id));
      pausedIds.forEach((id) => { if (!currentIds.has(id)) pausedIds.delete(id); });
      if (!currentIds.has(topId.value)) topId.value = "";
      enterCards(enteringIds, () => {
        isRefreshing.value = false;
        scheduleRotation();
      });
    }, ANIMATION_MS);
  };

  // 无固定延迟与独立加载层，容器取得有效尺寸即初始化。
  watch([width, height], ([wallWidth, wallHeight]) => {
    if (initialized || wallWidth <= 0 || wallHeight <= 0) return;
    initialized = true;
    initialize();
  }, { immediate: true });

  return {
    container, // 便签墙容器引用
    cards, // 当前便签列表
    topId, // 点击置顶状态
    isRefreshing, // 按钮可观察的刷新状态
    refresh, // 手动更新整面墙
    setPaused, // 接收悬停状态
    setCardSize, // 接收实际尺寸
    getStyle: (card: NoteItem) => getCardStyle(card, width.value, height.value), // 当前容器下的布局与动画样式
  };
};
