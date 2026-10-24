export type SharedIdeaStatus = 'open' | 'in_progress' | 'completed' | 'closed';
export type SupportType = 'money' | 'time' | 'skill';
export type SupporterStatus = 'offered' | 'accepted' | 'completed' | 'declined';

export interface SharedIdeaSupporter {
  id: string;
  shared_idea_id: string;
  user_id: string;
  support_type: SupportType;
  amount: number | null;
  message: string | null;
  status: SupporterStatus;
  created_at: string;
}

export interface SharedIdea {
  id: string;
  owner_id: string;
  insight_id: string | null;
  purpose_id: string | null;
  title: string;
  summary: string | null;
  category: string | null;
  tags: string[];
  needed_support: SupportType[];
  target_amount: number;
  funded_amount: number;
  supporter_count: number;
  status: SharedIdeaStatus;
  is_owner: boolean;
  supported_types: SupportType[];
  supporters?: SharedIdeaSupporter[];
  created_at: string;
  updated_at: string;
}
