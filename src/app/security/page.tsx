import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'セキュリティの取り組み | Katalyse',
  description: 'Katalyse がユーザーのデータを守るために行っているセキュリティ対策を、ユーザー視点の言葉で説明します。',
};

const CONTACT_URL = 'https://github.com/Densyakun/catalyst/issues';

const items = [
  {
    title: '通信の保護',
    body: 'ブラウザと本サービスの間は HTTPS で暗号化しています。ログイン情報や入力内容が平文で流れることはありません。',
  },
  {
    title: 'アカウントとデータの分離',
    body: 'ログインしたユーザーごとにデータへアクセスできる範囲を分けています。他のユーザーの課題やチャットを、通常の操作で見ることはできません。',
  },
  {
    title: '秘密情報の管理',
    body: 'API キーなどの秘密情報はサーバー側で管理し、ブラウザには表示しません。ソースコードや公開ページに秘密情報を埋め込まない運用を徹底しています。',
  },
  {
    title: 'AI に送る情報',
    body: 'AI による分析や提案に必要な範囲で、入力された課題やチャットの内容を処理します。処理に必要な情報は、サービス提供と品質改善の目的に限定して扱います。',
  },
  {
    title: '決済情報',
    body: '有料機能の決済は外部の決済サービスが処理します。本サービスがクレジットカード番号を直接保存することはありません。',
  },
  {
    title: 'API トークン',
    body: '外部エージェント連携用のトークンは、発行時にのみ表示し、保存時は復元できない形で管理します。不要になったトークンはいつでも失効できます。',
  },
  {
    title: '監視と改善',
    body: 'エラーの記録や利用状況を確認し、不具合や不審な動きの早期発見に努めています。改善のための情報は、個人を特定しにくい形で扱います。',
  },
  {
    title: '脆弱性の報告',
    body: 'セキュリティ上の問題を見つけた場合は、悪用せずに下記の窓口へご連絡ください。確認できた問題は、影響を抑えることを優先して対応します。',
  },
];

export default function SecurityPage() {
  return (
    <main className="container" style={{ maxWidth: '900px', paddingBottom: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.8rem', flexWrap: 'wrap', margin: '0.4rem 0 0.9rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '1.4rem', margin: 0 }}>セキュリティの取り組み</h1>
        <Link href="/" style={{ fontSize: '0.75rem', color: 'var(--accent-color)' }}>アプリに戻る</Link>
      </header>

      <div style={{ display: 'grid', gap: '0.8rem' }}>
        <section className="glass-panel" style={{ padding: '1rem' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            Katalyse は、ユーザーが安心して課題や考えを預けられるサービスを目指しています。
            ここでは、専門的な構成の詳細ではなく、利用者にとって意味のある対策を説明します。
          </p>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.8rem' }}>
          {items.map((item) => (
            <section key={item.title} className="glass-panel" style={{ padding: '0.9rem 1rem' }}>
              <h2 style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}>{item.title}</h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.75 }}>{item.body}</p>
            </section>
          ))}
        </div>

        <section className="glass-panel" style={{ padding: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', marginBottom: '0.4rem' }}>利用者のみなさまへのお願い</h2>
          <ul style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: '1.1rem', display: 'grid', gap: '0.2rem' }}>
            <li>パスワードを他のサービスと使い回さないでください。</li>
            <li>心身の健康、金融、法律など、特に重要な判断は専門家にもご相談ください。</li>
            <li>他人の秘密情報や、公開されたくない情報の入力は控えてください。</li>
            <li>不審なログインや身に覚えのない操作に気づいた場合は、速やかにご連絡ください。</li>
          </ul>
        </section>

        <section className="glass-panel" style={{ padding: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', marginBottom: '0.4rem' }}>セキュリティに関する連絡先</h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            脆弱性やプライバシーに関するご連絡は、
            <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)' }}>
              GitHub Issues
            </a>
            またはアプリ内の「フィードバック」からお願いします。詳しい対応方針は
            <Link href="/legal#contact" style={{ color: 'var(--accent-color)' }}>お問い合わせ・批判の窓口</Link>
            に記載しています。
          </p>
        </section>
      </div>
    </main>
  );
}
