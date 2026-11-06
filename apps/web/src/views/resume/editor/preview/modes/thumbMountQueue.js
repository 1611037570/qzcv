// 所有缩略图共用挂载队列，避免同一批模板同时测量完整简历。
const mountQueue = [];
let scheduled = false;
// 单个空闲帧内最多挂载的卡片数：一次只挂一个时同屏卡片要排队等好几秒，
// 一次挂太多又会让每个空闲帧变成一两个长任务造成卡顿，取两张折中。
const MAX_MOUNT_PER_FRAME = 2;

const flushMountQueue = () => {
  for (let count = 0; count < MAX_MOUNT_PER_FRAME && mountQueue.length; count += 1) {
    mountQueue.shift()?.();
  }
  if (mountQueue.length) {
    scheduleMount();
    return;
  }
  scheduled = false;
};

const scheduleMount = () => {
  if (typeof window.requestIdleCallback === "function") {
    // 空闲帧迟迟不来时也要尽快放行下一批，排队时间不能由浏览器忙闲决定
    window.requestIdleCallback(flushMountQueue, { timeout: 120 });
    return;
  }
  window.setTimeout(flushMountQueue, 16);
};

export const enqueueThumbMount = (task) => {
  mountQueue.push(task);
  if (!scheduled) {
    scheduled = true;
    scheduleMount();
  }
  // 卡片在轮到挂载前离开列表时移除任务，避免卸载后继续渲染。
  return () => {
    const index = mountQueue.indexOf(task);
    if (index >= 0) mountQueue.splice(index, 1);
  };
};
