<script setup lang="ts">
import type { SharedState, UserPromptPreset } from '../core/types';
import { newId } from '../core/utils/id';
import JsonEditor from './JsonEditor.vue';

const props = defineProps<{
  shared: SharedState;
}>();

function addUserPrompt() {
  const prompt: UserPromptPreset = {
    id: newId(),
    text: ''
  };
  props.shared.userPrompts.push(prompt);
}

function removeUserPrompt(id: string) {
  if (props.shared.userPrompts.length <= 1) return;
  const idx = props.shared.userPrompts.findIndex((p) => p.id === id);
  if (idx < 0) return;
  props.shared.userPrompts.splice(idx, 1);
}
</script>

<template>
  <section>
    <div class="section-head">
      <div>
        <div class="section-title">全局设置</div>
        <div class="section-subtitle">User Prompts 将按顺序提交到 messages（位于 System Prompt 后）。</div>
      </div>
    </div>
    <div class="shared-grid">
      <div class="shared-left">
        <div class="flex-between" style="margin-bottom: 8px">
          <label>User Prompts（按顺序追加）</label>
          <button class="ghost" style="flex: 0 0 auto" @click="addUserPrompt">新增</button>
        </div>
        <div class="user-prompt-list">
          <details v-for="(prompt, index) in props.shared.userPrompts" :key="prompt.id" class="collapse user-prompt-collapse">
            <summary class="flex-between">
              <div class="row" style="gap: 6px; flex: 0 1 auto">
                <span>消息 {{ index + 1 }}</span>
              </div>
              <div class="small" style="flex: 0 0 auto">{{ prompt.text.length }} 字</div>
            </summary>
            <div style="margin-top: 10px">
              <textarea v-model="prompt.text" placeholder="输入用户消息（User Prompt）" />
              <div class="row user-prompt-actions" style="margin-top: 8px">
                <button
                  class="ghost"
                  style="flex: 0 0 auto"
                  @click="removeUserPrompt(prompt.id)"
                  :disabled="props.shared.userPrompts.length === 1"
                >
                  删除
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>

      <div class="shared-right">
        <div>
          <label for="tools">Tools 定义（JSON）</label>
          <JsonEditor
            id="tools"
            class="tools-inline-editor"
            v-model="props.shared.toolsDefinition"
            placeholder='[{"name":"fetchDocs","description":"..."}]'
          />
        </div>
        <div style="margin-top: 12px">
          <label>默认参数</label>
          <div class="param-grid">
            <label class="param-field">
              <span>temperature</span>
              <input type="number" step="0.1" v-model.number="props.shared.defaultParams.temperature" />
            </label>
            <label class="param-field">
              <span>top_p</span>
              <input type="number" step="0.1" v-model.number="props.shared.defaultParams.top_p" />
            </label>
            <label class="param-field">
              <span>max_tokens</span>
              <input type="number" v-model.number="props.shared.defaultParams.max_tokens" />
            </label>
          </div>
        </div>
        <div class="shared-params-footer">
          <label class="row shared-switch" style="gap: 6px">
            <input type="checkbox" v-model="props.shared.enableSuggestions" />
            启用联想
          </label>
          <label class="row shared-switch" style="gap: 6px">
            <input type="checkbox" v-model="props.shared.streamOutput" />
            启用流式输出
          </label>
          <div class="small">关闭流式输出时，将在完整响应返回后一次性展示内容，cURL 也会同步更新。</div>
        </div>
      </div>
    </div>
  </section>
</template>
