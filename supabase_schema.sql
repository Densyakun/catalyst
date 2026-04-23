-- Create 'problems' table
CREATE TABLE IF NOT EXISTS public.problems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context TEXT NOT NULL,
    symptoms TEXT,
    constraints TEXT,
    goal TEXT,
    severity INTEGER,
    frequency TEXT,
    priority INTEGER,
    status TEXT DEFAULT 'pending',
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create 'actions' table
CREATE TABLE IF NOT EXISTS public.actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id UUID REFERENCES public.problems(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    description TEXT,
    cost JSONB, -- { "time": "2 hours", "money": 0 }
    expected_gain TEXT,
    risk TEXT,
    link TEXT,
    is_recommended BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create 'outcomes' table
CREATE TABLE IF NOT EXISTS public.outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id UUID REFERENCES public.actions(id) ON DELETE CASCADE,
    did_execute BOOLEAN DEFAULT false,
    delta DECIMAL,
    satisfaction INTEGER,
    complaint TEXT,
    feedback_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
-- For MVP, we allow public access, but in production this should be restricted
ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcomes ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (Read/Write)
CREATE POLICY "Allow public select" ON public.problems FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.problems FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select" ON public.actions FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.actions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select" ON public.outcomes FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.outcomes FOR INSERT WITH CHECK (true);
