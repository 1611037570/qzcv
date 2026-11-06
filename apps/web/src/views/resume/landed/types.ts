// 便签在整面墙中的归一化落点。
export interface NotePosition {
  // 横向位置比例，范围为零至一
  horizontalRatio: number;
  // 纵向位置比例，范围为零至一
  verticalRatio: number;
}

// 单张便签的数据与进出场状态。
export interface NoteItem extends NotePosition {
  // 当前轮次的唯一标识
  id: string;
  // 展示与复制共用的纯文本
  content: string;
  // 首推强调便签或普通随机便签
  type: "fixed" | "random";
  // 未旋转缩放的实际宽度，像素
  measuredWidth: number;
  // 未旋转缩放的实际高度，像素
  measuredHeight: number;
  // 静态倾斜角度
  angle: number;
  // 是否已经进入可见状态
  visible: boolean;
  // 是否正在离场
  leaving: boolean;
  // 是否完成入场并允许轮换
  ready: boolean;
}

// 页面能调用的便签墙操作，不暴露内部轮换状态。
export interface NoteWallApi {
  // 手动更新整面墙内容和落点
  refresh: () => void;
}
