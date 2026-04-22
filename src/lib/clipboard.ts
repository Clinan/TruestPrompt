// 为什么：navigator.clipboard.writeText 在非 HTTPS 环境或某些浏览器/
// 嵌入场景会直接 reject，导致分享链接不可用。原 handleShareProject 里
// 塞了一段 textarea + execCommand('copy') 的 fallback，逻辑复用度为 0。
// 抽出来便于其他场景（如未来复制 curl、复制 profile 配置）直接用。

export async function copyToClipboardWithFallback(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through to textarea fallback
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  // 避免 iOS 上的滚动跳动
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}
