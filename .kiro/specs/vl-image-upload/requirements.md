# Requirements Document

## Introduction

本功能为 TruestPrompt 的 PromptComposer 组件添加图片支持，使用户能够在 User Message 中配置图片内容，以便调用视觉语言模型（VL Model）。用户可以通过 URL 或本地文件上传（Base64 编码）两种方式添加图片。

## Glossary

- **VL Model**: Vision-Language Model，视觉语言模型，能够处理图片和文本的多模态大模型
- **PromptComposer**: 消息编辑器组件，用于编辑 User Prompt 消息列表
- **UserPromptPreset**: 消息预设类型，包含 id、role、text 字段
- **Base64**: 一种将二进制数据编码为 ASCII 字符串的方法
- **Image Content**: 图片内容，可以是 URL 或 Base64 编码的数据

## Requirements

### Requirement 1

**User Story:** As a user, I want to add images to my user messages, so that I can test vision-language models with multimodal inputs.

#### Acceptance Criteria

1. WHEN a user clicks the image button in a user message card THEN the system SHALL display an image configuration panel
2. WHEN a user selects URL mode THEN the system SHALL provide an input field for entering the image URL
3. WHEN a user selects file upload mode THEN the system SHALL provide a file picker that accepts image files (jpg, png, gif, webp)
4. WHEN a user uploads a local image file THEN the system SHALL convert the file to Base64 encoding and store it in the message
5. WHEN a message contains images THEN the system SHALL display image thumbnails in the message card

### Requirement 2

**User Story:** As a user, I want to manage multiple images in a single message, so that I can provide rich visual context to the model.

#### Acceptance Criteria

1. WHEN a user adds an image to a message THEN the system SHALL append the image to the message's image list
2. WHEN a user clicks the delete button on an image thumbnail THEN the system SHALL remove that image from the message
3. WHEN displaying multiple images THEN the system SHALL show them in a horizontal scrollable thumbnail strip

### Requirement 3

**User Story:** As a user, I want the image data to be properly formatted for API requests, so that the VL model can process my images correctly.

#### Acceptance Criteria

1. WHEN building the API request THEN the system SHALL format image content according to OpenAI vision API format (content array with type: "image_url")
2. WHEN an image is provided via URL THEN the system SHALL include the URL directly in the request
3. WHEN an image is provided via Base64 THEN the system SHALL format it as a data URL (data:image/[type];base64,[data])
4. WHEN serializing messages for storage THEN the system SHALL preserve all image data and metadata
5. WHEN deserializing messages from storage THEN the system SHALL restore all image data correctly

### Requirement 4

**User Story:** As a user, I want clear feedback when working with images, so that I can understand the state of my image attachments.

#### Acceptance Criteria

1. WHEN a local file is being converted to Base64 THEN the system SHALL complete the conversion synchronously without blocking UI
2. WHEN a file read operation fails THEN the system SHALL display an error message with the failure reason
3. WHEN an image URL is invalid or unreachable THEN the system SHALL display a broken image indicator
4. WHEN hovering over an image thumbnail THEN the system SHALL display the image source type (URL or Base64) and estimated size

### Requirement 5

**User Story:** As a user, I want image support to only appear for user role messages, so that the interface remains clean and contextually appropriate.

#### Acceptance Criteria

1. WHEN the message role is "user" THEN the system SHALL display the image attachment button
2. WHEN the message role is "system" or "assistant" THEN the system SHALL hide the image attachment functionality
3. WHEN changing a message role from "user" to another role THEN the system SHALL preserve existing images but hide the image UI
4. WHEN changing a message role back to "user" THEN the system SHALL restore the image UI with previously attached images

