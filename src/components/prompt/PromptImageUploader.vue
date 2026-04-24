<script setup lang="ts">
import { ref } from 'vue';
import { Button, Tooltip, message, Radio, Input, Upload } from 'ant-design-vue';
import {
  PictureOutlined,
  PlusOutlined,
  LinkOutlined,
  UploadOutlined,
  CloseCircleOutlined
} from '@ant-design/icons-vue';
import type { ImageContent, UserPromptPreset } from '../../types';
import { newId } from '../../core/utils/id';
import {
  fileToBase64,
  isValidImageUrl,
  estimateBase64Size,
  getImageTypeLabel,
  SUPPORTED_IMAGE_EXTENSIONS,
  isSupportedImageType,
  parseDataUrl
} from '../../core/utils/imageUtils';

const { Input: AntInput } = Input;

const props = defineProps<{
  msg: UserPromptPreset;
}>();

const emit = defineEmits<{
  updateMessage: [id: string, patch: Partial<UserPromptPreset>];
  addImage: [msgId: string, image: ImageContent];
  removeImage: [msgId: string, imageIndex: number];
}>();

const expanded = ref(false);
const imageUrlInputs = ref<Record<string, string>>({});
const imageInputMode = ref<Record<string, 'url' | 'file'>>({});
const imageLoadErrors = ref<Set<string>>(new Set());

function togglePanel() {
  expanded.value = !expanded.value;
  if (expanded.value && !imageInputMode.value[props.msg.id]) {
    imageInputMode.value[props.msg.id] = 'url';
  }
}

function getInputMode(): 'url' | 'file' {
  return imageInputMode.value[props.msg.id] || 'url';
}

function setInputMode(mode: 'url' | 'file') {
  imageInputMode.value[props.msg.id] = mode;
}

function addUrlImage() {
  const url = imageUrlInputs.value[props.msg.id]?.trim();
  if (!url) { message.warning('请输入图片 URL'); return; }
  if (!isValidImageUrl(url)) { message.error('无效的图片 URL'); return; }
  const image: ImageContent = { id: newId(), type: 'url', url, name: url.split('/').pop() || 'image' };
  emit('addImage', props.msg.id, image);
  imageUrlInputs.value[props.msg.id] = '';
}

async function handleFileUpload(file: File) {
  if (!isSupportedImageType(file)) { message.error(`不支持的图片格式: ${file.type}`); return false; }
  try {
    const dataUrl = await fileToBase64(file);
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) { message.error('文件转换失败'); return false; }
    const image: ImageContent = { id: newId(), type: 'base64', base64: parsed.base64, mimeType: parsed.mimeType, name: file.name };
    emit('addImage', props.msg.id, image);
    message.success(`已添加图片: ${file.name}`);
  } catch (err) { message.error(`文件读取失败: ${(err as Error).message}`); }
  return false;
}

function removeImage(imageIndex: number) {
  emit('removeImage', props.msg.id, imageIndex);
}

function getImageDisplayUrl(image: ImageContent): string {
  if (image.type === 'url') return image.url || '';
  return `data:${image.mimeType || 'image/png'};base64,${image.base64}`;
}

function getImageTooltip(image: ImageContent): string {
  const typeLabel = getImageTypeLabel(image.type);
  let info = `类型: ${typeLabel}`;
  if (image.name) info += `\n名称: ${image.name}`;
  if (image.type === 'base64' && image.base64) info += `\n大小: ${estimateBase64Size(image.base64)}`;
  return info;
}

function handleImageError(imageId: string) {
  imageLoadErrors.value.add(imageId);
  imageLoadErrors.value = new Set(imageLoadErrors.value);
}

function isImageError(imageId: string): boolean {
  return imageLoadErrors.value.has(imageId);
}
</script>

<template>
  <div>
    <!-- 图片按钮 -->
    <Tooltip title="添加图片">
      <Button
        type="text"
        size="small"
        :class="{ 'image-btn-active': expanded || (props.msg.images && props.msg.images.length > 0) }"
        @click="togglePanel"
      >
        <template #icon><PictureOutlined /></template>
      </Button>
    </Tooltip>

    <!-- 图片缩略图列表 -->
    <div v-if="props.msg.images && props.msg.images.length > 0" class="image-thumbnails">
      <div v-for="(image, imgIndex) in props.msg.images" :key="image.id" class="image-thumbnail">
        <Tooltip :title="getImageTooltip(image)">
          <div class="thumbnail-wrapper">
            <img v-if="!isImageError(image.id)" :src="getImageDisplayUrl(image)" :alt="image.name || 'image'" @error="handleImageError(image.id)" />
            <div v-else class="thumbnail-error">
              <PictureOutlined />
              <span>加载失败</span>
            </div>
            <Button type="text" size="small" class="thumbnail-remove" danger @click="removeImage(imgIndex)">
              <template #icon><CloseCircleOutlined /></template>
            </Button>
          </div>
        </Tooltip>
        <span class="thumbnail-label">{{ getImageTypeLabel(image.type) }}</span>
      </div>
    </div>

    <!-- 图片添加面板 -->
    <div v-if="expanded" class="image-panel">
      <div class="image-panel-header">
        <Radio.Group :value="getInputMode()" size="small" @change="(e: any) => setInputMode(e.target.value)">
          <Radio.Button value="url"><LinkOutlined /> URL</Radio.Button>
          <Radio.Button value="file"><UploadOutlined /> 上传</Radio.Button>
        </Radio.Group>
      </div>
      <div class="image-panel-content">
        <div v-if="getInputMode() === 'url'" class="url-input-group">
          <AntInput v-model:value="imageUrlInputs[props.msg.id]" placeholder="输入图片 URL..." size="small" @pressEnter="addUrlImage" />
          <Button type="primary" size="small" @click="addUrlImage">
            <template #icon><PlusOutlined /></template>添加
          </Button>
        </div>
        <div v-else class="file-upload-group">
          <Upload :accept="SUPPORTED_IMAGE_EXTENSIONS" :showUploadList="false" :beforeUpload="(file: File) => handleFileUpload(file)">
            <Button size="small"><template #icon><UploadOutlined /></template>选择图片</Button>
          </Upload>
          <span class="upload-hint">支持 JPG、PNG、GIF、WebP</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-btn-active { color: var(--primary-color) !important; }

.image-thumbnails {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.image-thumbnail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.thumbnail-wrapper {
  position: relative;
  width: 60px;
  height: 60px;
  overflow: hidden;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
}
.thumbnail-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  height: 100%;
  font-size: 12px;
  color: var(--text-tertiary);
}

.thumbnail-remove {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 18px !important;
  height: 18px !important;
  padding: 0 !important;
  background: var(--bg-primary) !important;
  border-radius: 50% !important;
  opacity: 0;
  transition: opacity 150ms;
}
.thumbnail-wrapper:hover .thumbnail-remove { opacity: 1; }

.thumbnail-label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.image-panel {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-secondary);
  border: 1px dashed var(--border-color);
  border-radius: 4px;
}
.image-panel-header { margin-bottom: 8px; }
.image-panel-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.url-input-group {
  flex: 1;
  display: flex;
  gap: 8px;
}
.url-input-group .ant-input { flex: 1; }

.file-upload-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.upload-hint {
  font-size: 13px;
  color: var(--text-tertiary);
}
</style>