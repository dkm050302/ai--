export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
export const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');

export function getDeepSeekChatCompletionsUrl(): string {
  return `${DEEPSEEK_BASE_URL}/chat/completions`;
}

export function getDeepSeekModelsUrl(): string {
  return `${DEEPSEEK_BASE_URL}/models`;
}
