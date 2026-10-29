export interface BillingPack {
  id: string;
  label: string;
  amount_jpy: number;
  credits: number;
}

export interface BillingInfo {
  available: boolean;
  currency: string;
  credits_per_yen: number;
  packs: BillingPack[];
}

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export interface PaymentRecord {
  id: string;
  purpose_id: string | null;
  amount: number;
  currency: string;
  credits: number;
  status: PaymentStatus;
  pack_id: string | null;
  created_at: string;
  paid_at: string | null;
}
