-- ====================================================================
-- Supabase Migration: RLS Enforcement & Publication Support (idempotent)
-- ====================================================================

-- 1. Ensure 'created_by' owner reference columns exist on core tables
ALTER TABLE public.problems ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE public.outcomes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- Migrate existing 'user_id' data to 'created_by' if created_by is null
UPDATE public.problems SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.actions SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;

-- 2. Add 'visibility' column to 'problems' table for privacy control
ALTER TABLE public.problems ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private';

-- Add check constraint for visibility safety (private | household | published)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'problems_visibility_check'
    ) THEN
        ALTER TABLE public.problems ADD CONSTRAINT problems_visibility_check CHECK (visibility IN ('private', 'household', 'published'));
    END IF;
END $$;

-- 3. Create 'published_records' table for managing review queue on public/multi-mode instances
CREATE TABLE IF NOT EXISTS public.published_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_instance_url TEXT,
    source_project_id UUID,
    source_owner_id UUID,
    consent JSONB,
    canonical_project_id UUID,
    moderation_status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add check constraint for moderation_status safety
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'published_records_moderation_check'
    ) THEN
        ALTER TABLE public.published_records ADD CONSTRAINT published_records_moderation_check CHECK (moderation_status IN ('pending', 'approved', 'rejected'));
    END IF;
END $$;

-- 4. Ensure Row Level Security (RLS) is enabled
ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.published_records ENABLE ROW LEVEL SECURITY;

-- Note: 'published_records' has no SELECT/INSERT policies for general users,
-- restricting it purely to Service Role operations via API route (very secure).

-- 5. Drop existing policies to prevent conflict or duplication
-- problems table
DROP POLICY IF EXISTS "Allow public select" ON public.problems;
DROP POLICY IF EXISTS "Allow public insert" ON public.problems;
DROP POLICY IF EXISTS "Users can see only their own problems" ON public.problems;
DROP POLICY IF EXISTS "Users can insert their own problems" ON public.problems;
DROP POLICY IF EXISTS "problems_select_owner" ON public.problems;
DROP POLICY IF EXISTS "problems_select_household" ON public.problems;
DROP POLICY IF EXISTS "problems_public_read" ON public.problems;
DROP POLICY IF EXISTS "problems_insert_owner" ON public.problems;
DROP POLICY IF EXISTS "problems_update_owner" ON public.problems;
DROP POLICY IF EXISTS "problems_delete_owner" ON public.problems;

-- actions table
DROP POLICY IF EXISTS "Allow public select" ON public.actions;
DROP POLICY IF EXISTS "Allow public insert" ON public.actions;
DROP POLICY IF EXISTS "Users can see only their own actions" ON public.actions;
DROP POLICY IF EXISTS "Users can insert their own actions" ON public.actions;
DROP POLICY IF EXISTS "actions_select_owner" ON public.actions;
DROP POLICY IF EXISTS "actions_select_public" ON public.actions;
DROP POLICY IF EXISTS "actions_insert_owner" ON public.actions;
DROP POLICY IF EXISTS "actions_update_owner" ON public.actions;
DROP POLICY IF EXISTS "actions_delete_owner" ON public.actions;

-- outcomes table
DROP POLICY IF EXISTS "Allow public select" ON public.outcomes;
DROP POLICY IF EXISTS "Allow public insert" ON public.outcomes;
DROP POLICY IF EXISTS "outcomes_select_owner" ON public.outcomes;
DROP POLICY IF EXISTS "outcomes_select_public" ON public.outcomes;
DROP POLICY IF EXISTS "outcomes_insert_owner" ON public.outcomes;
DROP POLICY IF EXISTS "outcomes_update_owner" ON public.outcomes;
DROP POLICY IF EXISTS "outcomes_delete_owner" ON public.outcomes;

-- 6. Define strict owner-based and public-read RLS policies

-- ==========================================
-- 'problems' Policies
-- ==========================================
-- Owner can read their own problems
CREATE POLICY "problems_select_owner" ON public.problems FOR SELECT USING (auth.uid() = created_by);
-- Household sharing (any logged-in user can view problems marked as household)
CREATE POLICY "problems_select_household" ON public.problems FOR SELECT USING (visibility = 'household' AND auth.uid() IS NOT NULL);
-- Public read (anyone including anonymous users can view published problems)
CREATE POLICY "problems_public_read" ON public.problems FOR SELECT USING (visibility = 'published');
-- Owner can insert their own problems
CREATE POLICY "problems_insert_owner" ON public.problems FOR INSERT WITH CHECK (auth.uid() = created_by);
-- Owner can update their own problems
CREATE POLICY "problems_update_owner" ON public.problems FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
-- Owner can delete their own problems
CREATE POLICY "problems_delete_owner" ON public.problems FOR DELETE USING (auth.uid() = created_by);

-- ==========================================
-- 'actions' Policies
-- ==========================================
-- Owner can read their own actions
CREATE POLICY "actions_select_owner" ON public.actions FOR SELECT USING (auth.uid() = created_by);
-- Public read if parent problem is published
CREATE POLICY "actions_select_public" ON public.actions FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.problems p 
        WHERE p.id = problem_id AND p.visibility = 'published'
    )
);
-- Owner can insert their own actions
CREATE POLICY "actions_insert_owner" ON public.actions FOR INSERT WITH CHECK (auth.uid() = created_by);
-- Owner can update their own actions
CREATE POLICY "actions_update_owner" ON public.actions FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
-- Owner can delete their own actions
CREATE POLICY "actions_delete_owner" ON public.actions FOR DELETE USING (auth.uid() = created_by);

-- ==========================================
-- 'outcomes' Policies
-- ==========================================
-- Owner can read their own outcomes
CREATE POLICY "outcomes_select_owner" ON public.outcomes FOR SELECT USING (auth.uid() = created_by);
-- Public read if grandparent problem is published
CREATE POLICY "outcomes_select_public" ON public.outcomes FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.actions a 
        JOIN public.problems p ON a.problem_id = p.id 
        WHERE a.id = action_id AND p.visibility = 'published'
    )
);
-- Owner can insert their own outcomes
CREATE POLICY "outcomes_insert_owner" ON public.outcomes FOR INSERT WITH CHECK (auth.uid() = created_by);
-- Owner can update their own outcomes
CREATE POLICY "outcomes_update_owner" ON public.outcomes FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
-- Owner can delete their own outcomes
CREATE POLICY "outcomes_delete_owner" ON public.outcomes FOR DELETE USING (auth.uid() = created_by);
