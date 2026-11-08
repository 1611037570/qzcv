<template>
  <Component
    v-model="value"
    :is="h(ElDatePicker, { ...$attrs, ref: changeRef }, $slots)"
    class="w-full rounded-3xl border-none text-sf-text"
    :class="bg"
  />
</template>

<script setup lang="ts">
import { ElDatePicker } from "element-plus";
// 动态导入不生效，手动导入
import "element-plus/theme-chalk/el-date-picker-panel.css";
import type { ComponentInstance } from "vue";
import { getCurrentInstance, h } from "vue";

defineOptions({ name: "SfDatePicker" });

const bg = inject("bg");

const vm: any = getCurrentInstance();
const value = defineModel("modelValue");
function changeRef(exports: any) {
  vm.exposed = exports;
}
defineExpose({} as ComponentInstance<typeof ElDatePicker>);
</script>

<style lang="scss">
/* 日期输入容器去掉默认阴影与底色，跟随卡片背景，与输入框、下拉框保持一致。
   说明：模板用 h() 渲染 ElDatePicker，作用域属性挂不到其根节点，:deep() 无法命中，
   因此改用全局样式按 el-date-editor 类名限定范围；
   单选日期的输入容器是后代节点，区间日期的根节点自身就是输入容器，两条分别命中。 */
.el-date-editor .el-input__wrapper,
.el-date-editor.el-input__wrapper {
  box-shadow: none;
  background-color: transparent;
}

/* 日期弹层挂在 body 下，同样用全局样式设置圆角 */
.el-date-picker {
  border-radius: 24px !important;
}
</style>
