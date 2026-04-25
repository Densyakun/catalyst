# Catalyst: 意思決定データ駆動型 自律進化インフラ

Catalystは、個人の抱える不透明な課題をAIが構造化し、具体的なアクションへと変換し、最終的に社会課題の解決まで接続する「意思決定インフラ」です。

## 1. Catalyst 憲法 (The Constitution)

各AIエージェントは、以下の3原則に基づいた「行動設計系」のプロンプトで動作します。

1. **ナビゲーション（迷わず選べるが、自分で決めたと思える）**
   - ユーザーの「考える負担」を極限まで減らしつつ、選択の自由を奪わず、本音（データの純度）を保護する。
2. **エンパワーメント（損を理解できるが、押し付けられない）**
   - 損失回避の心理に寄り添いリスクを提示するが、常に「逃げ道（代替案）」と「スモールステップ」を提供し、実行の勇気を与える。
3. **バリデーション（一人の問題が、自然に社会に繋がる）**
   - 「あなたは一人ではない」という共感（可視化）から始め、段階的に共通課題（クラスター）への協力と連帯へと導く。

## 2. 意思決定プロトコル (The 6-Step Protocol)

1. **収集 (Intake)**: 対話を通じて、課題の背景(Context)、症状(Symptoms)、制約(Constraints)を抽出。
2. **構造化 (Structuring)**: 収集データを重要度、頻度、タグ等に数値化し、意思決定データとして正規化。
3. **優先度決定 (Prioritizing)**: 複数の課題から、解決の緊急性とインパクトに基づいて着手すべき課題を特定。
4. **解決提案 (Solving)**: 推奨アクションと低コストな代替案を提示。リスクと期待利得を明示。
5. **実行支援 (Execution)**: 外部サービス連携や検索URL生成、リマインド設定等を通じて行動をトリガー。
6. **評価 (Evaluating)**: 実行結果と満足度を `outcomes` として記録し、将来の提案精度を向上（※開発中）。

## 3. 自律的インフラ機能 (Autonomous Features)

- **AI モデルの自律選択とフォールバック**: 
  - タスクの性質（構造化 vs 解決提案）に合わせて最適なモデル（Gemini, GPT, Claude等）を自動選択。
  - エラー検知時に即座に代替モデルへ切り替える「自己修復型プロバイダー冗長性」。
- **診断セッションの永続化**:
  - 診断の進捗をリアルタイムに保存し、中断してもいつでも再開可能。
- **エージェンティック UI (Self-Mutating UI)**:
  - `Clusterer Agent` が共通課題を特定した際、その課題に最適な「協力用UI（データ収集、署名、リソース共有等）」を自律的に設計・生成。

## 4. 技術スタック

- **Frontend**: Next.js (App Router), React, Framer Motion
- **Backend**: Next.js API Routes, Vercel
- **Database/Auth**: Supabase (PostgreSQL)
- **AI**: Vercel AI SDK (Google Generative AI, OpenAI, Anthropic)

## 5. セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env.local` に API キーを設定してください。
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

### 3. データベースのセットアップ
`supabase_migration_v2.sql` および各追加 SQL を Supabase SQL Editor で実行してください。
