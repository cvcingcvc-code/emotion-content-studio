import {
  ContentItemSchema,
  CreateContentInputSchema,
  GenerateContentInputSchema,
  RegenerateContentInputSchema,
  GeneratedContentSchema,
  type ContentItem,
  type GeneratedContent,
} from '@emotion-studio/contracts';
import { apiRequest, type PreviewMode } from './api';

export async function createStudioContent(input: unknown, mode: PreviewMode): Promise<ContentItem> {
  const payload = CreateContentInputSchema.parse(input);
  return apiRequest('/api/v1/studio/content-items', mode, ContentItemSchema, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function analyzeStudioContent(id: string, mode: PreviewMode): Promise<ContentItem> {
  return apiRequest(
    `/api/v1/studio/content-items/${encodeURIComponent(id)}/analyze`,
    mode,
    ContentItemSchema,
    { method: 'POST' },
  );
}

export async function generateStudioContent(contentIds: string[], mode: PreviewMode): Promise<GeneratedContent> {
  const payload = GenerateContentInputSchema.parse({ contentIds });
  return apiRequest('/api/v1/studio/generated-contents', mode, GeneratedContentSchema, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function regenerateStudioContent(id: string, section: string, mode: PreviewMode): Promise<GeneratedContent> {
  const payload = RegenerateContentInputSchema.parse({ section });
  return apiRequest(`/api/v1/generated-contents/${encodeURIComponent(id)}/regenerate`, mode, GeneratedContentSchema, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
