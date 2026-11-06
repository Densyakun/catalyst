import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '運営者情報・利用規約・プライバシーポリシー | Katalyse',
  description: 'Katalyse の運営者情報、利用規約、プライバシーポリシー、お問い合わせ・批判の窓口をまとめています。',
};

const CONTACT_URL = 'https://github.com/Densyakun/catalyst/issues';

const headingStyle = {
  fontSize: '1.05rem',
  marginBottom: '0.55rem',
  color: 'var(--text-primary)',
} as const;

const bodyStyle = {
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.8,
} as const;

const listStyle = {
  ...bodyStyle,
  paddingLeft: '1.1rem',
  display: 'grid',
  gap: '0.25rem',
} as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="glass-panel" style={{ padding: '1rem', scrollMarginTop: '1rem' }}>
      <h2 style={headingStyle}>{title}</h2>
      {children}
    </section>
  );
}

export default function LegalPage() {
  return (
    <main className="container" style={{ maxWidth: '900px', paddingBottom: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.8rem', flexWrap: 'wrap', margin: '0.4rem 0 0.9rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '1.4rem', margin: 0 }}>Katalyse の信頼情報</h1>
        <Link href="/" style={{ fontSize: '0.75rem', color: 'var(--accent-color)' }}>アプリに戻る</Link>
      </header>

      <div style={{ display: 'grid', gap: '0.8rem' }}>
        <Section id="operator" title="運営者情報">
          <dl style={{ ...bodyStyle, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 0.8rem' }}>
            <dt>サービス名</dt>
            <dd>Katalyse（カタライズ）</dd>
            <dt>運営者</dt>
            <dd>Densyakun（個人開発）</dd>
            <dt>連絡先</dt>
            <dd>
              <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)' }}>
                GitHub Issues
              </a>
              （アプリ内の「フィードバック」からも送信できます）
            </dd>
            <dt>所在地・電話</dt>
            <dd>個人開発のため設置していません。ご連絡は上記の窓口へお願いします。</dd>
          </dl>
        </Section>

        <Section id="terms" title="利用規約">
          <div style={{ ...bodyStyle, display: 'grid', gap: '0.6rem' }}>
            <p>本規約は、Katalyse（以下「本サービス」）の利用条件を定めるものです。利用者は、本サービスを利用した時点で本規約に同意したものとみなします。</p>
            <p><strong>1. 利用条件</strong><br />利用者は、自らの責任で本サービスを利用するものとし、法令、公序良俗、第三者の権利を侵害してはなりません。</p>
            <p><strong>2. 禁止事項</strong><br />不正アクセス、他者のアカウント利用、サービス運営の妨害、違法・有害な情報の投稿、他者への迷惑行為を禁止します。</p>
            <p><strong>3. AI の出力</strong><br />本サービスの提案・分析は参考情報です。内容の正確性・完全性を保証するものではなく、最終的な判断と行動は利用者自身が行うものとします。</p>
            <p><strong>4. 有料機能</strong><br />有料機能の料金・支払方法は購入画面に表示します。決済は外部の決済サービスを通じて行われ、本サービスはカード情報を保存しません。</p>
            <p><strong>5. サービスの変更・停止</strong><br />運営者は、事前の告知なく機能の追加・変更・停止を行う場合があります。</p>
            <p><strong>6. 知的財産・投稿内容</strong><br />利用者が入力した内容の権利は利用者に帰属します。運営者は、本サービスの提供・改善に必要な範囲でこれを利用できるものとします。</p>
            <p><strong>7. 免責</strong><br />運営者は、本サービスの利用により生じた損害について、故意または重大な過失がある場合を除き、責任を負いません。</p>
            <p><strong>8. 規約の変更</strong><br />本規約を変更する場合は、本ページ等で告知します。変更後の利用は、変更後の規約への同意とみなします。</p>
            <p><strong>9. 準拠法・窓口</strong><br />本規約は日本法に準拠します。本サービスに関するお問い合わせは、下記の窓口へお願いします。</p>
          </div>
        </Section>

        <Section id="privacy" title="プライバシーポリシー">
          <div style={{ ...bodyStyle, display: 'grid', gap: '0.6rem' }}>
            <p><strong>1. 取得する情報</strong></p>
            <ul style={listStyle}>
              <li>アカウント情報（メールアドレス、外部ログインのプロフィール情報など）</li>
              <li>利用者が入力・送信した内容（課題、チャット、アイデア、フィードバックなど）</li>
              <li>利用状況（操作ログ、エラー情報、AI 呼び出しの成否・処理時間など）</li>
              <li>有料機能を利用した場合の決済・取引情報（決済事業者が処理する情報を含む）</li>
            </ul>
            <p><strong>2. 利用目的</strong></p>
            <ul style={listStyle}>
              <li>本サービスの提供、本人確認、データの保存・表示</li>
              <li>AI による課題の構造化・提案・実行支援</li>
              <li>品質改善、不具合の調査、セキュリティの維持</li>
              <li>有料機能の決済・請求・お問い合わせ対応</li>
            </ul>
            <p><strong>3. 外部サービス</strong><br />本サービスは、認証・データ保存、AI 処理、決済、外部連携のために外部サービスを利用します。利用者が連携を許可した場合に限り、対象サービスへ必要な情報を送信します。</p>
            <p><strong>4. 第三者提供</strong><br />法令に基づく場合、利用者の同意がある場合、または業務委託先に必要な範囲で委託する場合を除き、個人を特定できる形で第三者に提供しません。統計的・匿名化された情報を、改善や調査のために利用する場合があります。</p>
            <p><strong>5. 安全管理</strong><br />通信の暗号化、アクセス制御、秘密情報の適切な管理など、合理的な安全管理措置を講じます。詳細は<Link href="/security" style={{ color: 'var(--accent-color)' }}>セキュリティ説明</Link>をご確認ください。</p>
            <p><strong>6. 保存期間・開示等</strong><br />情報は利用目的に必要な期間保存し、不要になった場合は削除または匿名化します。開示・訂正・削除のご希望は、下記の窓口へご連絡ください。</p>
            <p><strong>7. 改定</strong><br />本ポリシーを変更する場合は、本ページで告知します。</p>
          </div>
        </Section>

        <Section id="contact" title="お問い合わせ・批判の窓口">
          <div style={{ ...bodyStyle, display: 'grid', gap: '0.6rem' }}>
            <p>不具合、ご意見、批判、プライバシーに関するご相談は、次の窓口で受け付けます。</p>
            <ul style={listStyle}>
              <li>
                <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)' }}>
                  GitHub Issues
                </a>
                （公開の場で議論できます）
              </li>
              <li>アプリ内の「フィードバック」ボタン（ログイン前でも利用できます）</li>
            </ul>
            <p><strong>対応方針</strong></p>
            <ul style={listStyle}>
              <li>批判や指摘は、人格ではなく内容として扱い、誠実に確認します。</li>
              <li>原則として3営業日以内に受領を確認し、必要に応じて調査状況を共有します。</li>
              <li>重大な不具合・セキュリティ問題は、影響範囲を確認したうえで優先的に対応します。</li>
              <li>公開の場での対応が適切でない場合は、個別の連絡に切り替えます。</li>
              <li>プライバシーや法令に関わる情報は、公開前に必要な範囲で伏せます。</li>
            </ul>
          </div>
        </Section>
      </div>
    </main>
  );
}
