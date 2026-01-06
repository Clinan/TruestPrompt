/**
 * 测试 OutputBubble 组件在 SlotCard 中的集成
 * 验证流式输出显示和停止按钮状态同步
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SlotCard from '../components/SlotCard.vue';
import type { Slot, ProviderProfile, SharedState } from '../core/types';

describe('OutputBubble Integration in SlotCard', () => {
  const mockSlot: Slot = {
    id: 'test-slot',
    providerProfileId: 'test-provider',
    pluginId: 'openai',
    modelId: 'gpt-4',
    systemPrompt: 'You are a helpful assistant',
    paramOverride: null,
    selected: false,
    status: 'idle',
    output: '',
    thinking: '',
    toolCalls: null,
    metrics: {
      ttfbMs: null,
      totalMs: null
    }
  };

  const mockProviderProfiles: ProviderProfile[] = [{
    id: 'test-provider',
    name: 'Test Provider',
    apiKey: 'test-key',
    baseUrl: 'https://api.test.com',
    pluginId: 'openai'
  }];

  const mockDefaultParams: SharedState['defaultParams'] = {
    temperature: 0.7,
    top_p: 1.0,
    max_tokens: 2048
  };

  it('should render OutputBubble component instead of pre tag', () => {
    const wrapper = mount(SlotCard, {
      props: {
        slot: mockSlot,
        providerProfiles: mockProviderProfiles,
        modelOptions: [{ id: 'gpt-4', label: 'GPT-4' }],
        refreshingModels: false,
        streamOutput: true,
        disableRemove: false,
        defaultParams: mockDefaultParams,
        showParamDiffOnly: false
      }
    });

    // 应该包含 OutputBubble 组件
    expect(wrapper.findComponent({ name: 'OutputBubble' }).exists()).toBe(true);
    
    // 不应该包含旧的 pre.slot-output__body 元素
    expect(wrapper.find('pre.slot-output__body').exists()).toBe(false);
  });

  it('should pass correct props to OutputBubble', () => {
    const slotWithOutput: Slot = {
      ...mockSlot,
      status: 'running',
      output: 'Test output content',
      thinking: 'Test thinking content',
      metrics: {
        ttfbMs: 120,
        totalMs: 2300,
        tokens: { prompt: 10, completion: 50, total: 60 }
      }
    };

    const wrapper = mount(SlotCard, {
      props: {
        slot: slotWithOutput,
        providerProfiles: mockProviderProfiles,
        modelOptions: [{ id: 'gpt-4', label: 'GPT-4' }],
        refreshingModels: false,
        streamOutput: true,
        disableRemove: false,
        defaultParams: mockDefaultParams,
        showParamDiffOnly: false
      }
    });

    const outputBubble = wrapper.findComponent({ name: 'OutputBubble' });
    expect(outputBubble.props()).toEqual({
      output: 'Test output content',
      thinking: 'Test thinking content',
      status: 'running',
      metrics: {
        ttfbMs: 120,
        totalMs: 2300,
        tokens: { prompt: 10, completion: 50, total: 60 }
      },
      toolCalls: null,
      streamOutput: true
    });
  });

  it('should show stop button when slot is running', () => {
    const runningSlot: Slot = {
      ...mockSlot,
      status: 'running'
    };

    const wrapper = mount(SlotCard, {
      props: {
        slot: runningSlot,
        providerProfiles: mockProviderProfiles,
        modelOptions: [{ id: 'gpt-4', label: 'GPT-4' }],
        refreshingModels: false,
        streamOutput: true,
        disableRemove: false,
        defaultParams: mockDefaultParams,
        showParamDiffOnly: false
      }
    });

    // 应该显示停止按钮
    const stopButton = wrapper.find('button:contains("停止")');
    expect(stopButton.exists()).toBe(true);
    
    // 不应该显示运行按钮
    const runButton = wrapper.find('button:contains("运行")');
    expect(runButton.exists()).toBe(false);
  });

  it('should show run button when slot is not running', () => {
    const wrapper = mount(SlotCard, {
      props: {
        slot: mockSlot, // status: 'idle'
        providerProfiles: mockProviderProfiles,
        modelOptions: [{ id: 'gpt-4', label: 'GPT-4' }],
        refreshingModels: false,
        streamOutput: true,
        disableRemove: false,
        defaultParams: mockDefaultParams,
        showParamDiffOnly: false
      }
    });

    // 应该显示运行按钮
    const runButton = wrapper.find('button:contains("运行")');
    expect(runButton.exists()).toBe(true);
    
    // 不应该显示停止按钮
    const stopButton = wrapper.find('button:contains("停止")');
    expect(stopButton.exists()).toBe(false);
  });
});