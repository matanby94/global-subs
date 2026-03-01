export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Wallet {
  id: string;
  userId: string;
  balanceCredits: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  walletId: string;
  delta: number;
  reason: string;
  reference?: string;
  createdAt: Date;
}

export interface Artifact {
  hash: string; // PK
  srcRegistry: string;
  srcId: string;
  srcLang: string;
  dstLang: string;
  model: string;
  costChars: number;
  storageKey: string;
  checksPassed: Record<string, unknown>;
  createdAt: Date;
}

export interface ServeEvent {
  id: string;
  userId: string;
  artifactHash: string;
  pricingRuleId: string;
  creditsDebited: number;
  servedAt: Date;
  requestMeta: Record<string, unknown>;
}

export interface PricingRule {
  id: string;
  name: string;
  chargeMode: 'always' | 'first_only' | 'within_time_window';
  amountPerUseCredits: number;
  timeWindowMs?: number;
  createdAt: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  plan: 'unlimited';
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Job {
  id: string;
  kind: 'ingest' | 'translate' | 'postcheck';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TranslationRequest {
  sourceSubtitle: string; // URL or file
  sourceLang: string;
  targetLang: string;
  model: 'gpt-4' | 'gemini-pro' | 'deepl';
}

export interface TranslationResult {
  artifactHash: string;
  signedUrl: string;
  creditsCharged: number;
  cached: boolean;
}

export interface StremioSubtitle {
  id: string;
  url: string;
  lang: string;
}
