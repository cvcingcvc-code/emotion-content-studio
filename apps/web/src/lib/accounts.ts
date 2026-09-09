import {
  ACCOUNT_PROFILES,
  AccountIdSchema,
  type AccountId,
  type AccountProfile,
  type ContentLane,
} from '@emotion-studio/contracts';

export const accountProfiles: readonly AccountProfile[] = ACCOUNT_PROFILES;

export const accountLabels: Record<AccountId, string> = {
  personal_growth: '成长复盘',
  fun_english: '趣味英语',
  emotion_library: '情绪素材',
};

export const laneLabels: Record<ContentLane, string> = {
  growth_review: '成长复盘', growth_story: '真实成长故事', problem_solution: '问题解决',
  english_50: '英语 50 句', emotion_material: '情绪素材', emotion_post: '情绪创作',
};
export const relationshipLabels = { romantic: '亲密关系', family: '家庭', friendship: '友情', self: '自我', work: '工作', social: '社交', other: '其他' };

export function parseAccountId(value: unknown): AccountId | undefined {
  const parsed = AccountIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function getAccountIdFromUrl(pathname: string, search: string): AccountId {
  const routeMatch = /^\/accounts\/([^/]+)/.exec(pathname);
  const routeAccount = parseAccountId(routeMatch?.[1]);
  if (routeAccount) return routeAccount;

  const queryAccount = parseAccountId(new URLSearchParams(search).get('accountId'));
  if (queryAccount) return queryAccount;

  if (/^\/(?:import|library|materials|inspirations|generated)/.test(pathname)) {
    return 'emotion_library';
  }
  return 'personal_growth';
}

export function withAccount(path: string, accountId: AccountId): string {
  const url = new URL(path, 'https://studio.local');
  url.searchParams.set('accountId', accountId);
  return `${url.pathname}${url.search}`;
}
