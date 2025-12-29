# Implementation Plan

- [x] 1. 扩展类型定义
  - [x] 1.1 在 types.ts 中添加 ImageContent 类型
    - 定义 id, type, url, base64, mimeType, name 字段
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 1.2 扩展 UserPromptPreset 类型添加 images 字段
    - 添加可选的 images?: ImageContent[] 字段
    - 确保向后兼容（字段可选）
    - _Requirements: 3.4_
  - [x] 1.3 编写属性测试：Storage Round Trip
    - **Property 5: Storage Round Trip**
    - **Validates: Requirements 3.4, 3.5**

- [x] 2. 实现图片工具函数
  - [x] 2.1 创建 src/lib/imageUtils.ts
    - 实现 fileToBase64 函数（使用 FileReader API）
    - 实现 getImageMimeType 函数
    - 实现 estimateBase64Size 函数
    - 实现 isValidImageUrl 函数
    - 实现 parseDataUrl 函数
    - _Requirements: 1.4, 3.3, 4.4_
  - [x] 2.2 编写属性测试：File to Base64 Round Trip
    - **Property 1: File to Base64 Round Trip**
    - **Validates: Requirements 1.4**

- [x] 3. 更新 PromptComposer 组件支持图片
  - [x] 3.1 添加图片按钮和面板 UI
    - 在 user 角色消息卡片中添加图片按钮
    - 实现图片添加面板（URL/文件上传切换）
    - 实现 URL 输入框和文件选择器
    - _Requirements: 1.1, 1.2, 1.3, 5.1, 5.2_
  - [x] 3.2 实现图片缩略图显示
    - 显示已添加图片的缩略图列表
    - 支持删除单个图片
    - 显示 hover 提示（类型、大小）
    - _Requirements: 1.5, 2.3, 4.4_
  - [x] 3.3 实现图片添加和删除逻辑
    - 文件上传转 Base64 并添加到 images 数组
    - URL 添加到 images 数组
    - 删除指定索引的图片
    - _Requirements: 1.4, 2.1, 2.2_
  - [x] 3.4 编写属性测试：Image List Addition
    - **Property 2: Image List Addition**
    - **Validates: Requirements 2.1**
  - [x] 3.5 编写属性测试：Image List Removal
    - **Property 3: Image List Removal**
    - **Validates: Requirements 2.2**
  - [x] 3.6 编写属性测试：Role-Based Image Button Visibility
    - **Property 6: Role-Based Image Button Visibility**
    - **Validates: Requirements 5.1, 5.2**
  - [x] 3.7 编写属性测试：Image Preservation on Role Change
    - **Property 7: Image Preservation on Role Change**
    - **Validates: Requirements 5.3, 5.4**

- [x] 4. 更新插件层支持图片消息格式
  - [x] 4.1 修改 plugins.ts 中的 normalizeMessages 函数
    - 检测消息是否包含图片
    - 将带图片的消息转换为 OpenAI Vision API 格式
    - URL 图片直接使用 url
    - Base64 图片构建 data URL
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 4.2 编写属性测试：API Format Correctness
    - **Property 4: API Format Correctness**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 5. 实现错误处理和用户反馈
  - [x] 5.1 添加文件读取错误处理
    - 捕获 FileReader 错误并显示 message.error
    - 验证文件类型并提示不支持的格式
    - _Requirements: 4.1, 4.2_
  - [x] 5.2 添加 URL 验证和图片加载错误处理
    - URL 输入时验证格式
    - 图片加载失败显示 broken image 占位符
    - _Requirements: 4.3_

- [x] 6. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

