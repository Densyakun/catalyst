export type FundPurposeStatus = 'active' | 'completed' | 'paused';

export interface FundPurpose {
  id: string;
  owner_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  target_amount: number;
  balance: number;
  status: FundPurposeStatus;
  is_owner?: boolean;
  created_at: string;
  updated_at: string;
}

export type FundTransactionType = 'donation' | 'spend' | 'refund' | 'allocation';

export interface FundTransaction {
  id: string;
  purpose_id: string | null;
  user_id: string | null;
  type: FundTransactionType;
  amount: number;
  related_shared_idea_id: string | null;
  note: string | null;
  created_at: string;
}

export type FundingSource = 'purpose' | 'user' | 'donation_pool' | 'split' | 'none';

export interface FundingPlan {
  source: FundingSource;
  amount: number;
  user_balance: number;
  purpose_balance: number;
  pool_balance: number;
  shortfall: number;
}

export interface DonationPool {
  balance: number;
  total_donated: number;
  total_spent: number;
}

export interface FundsSnapshot {
  user_balance: number;
  donation_pool: DonationPool;
  purposes: FundPurpose[];
  transactions: FundTransaction[];
  cost_per_idea: number;
  recommended_plan: FundingPlan;
}
