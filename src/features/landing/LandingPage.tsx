'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { LOCALES, localize, registry, type RecipeId } from '@/registry';
import { resolveVariant, type Variant } from '@/lib/ab/variant';
import { setPreviewOnly, track } from '@/lib/ab/track';
import { RecipeThumb } from '../start/RecipeThumb';
import { AccountMenu } from '../shell/AccountMenu';
import { useAuth, useUiLocale } from '../shell/AppShell';
import { FeedbackButton } from '../feedback/Feedback';
import { copyFor } from './copy';
import type { LandingSlides } from './slides';
import { VideoEmbed } from './VideoEmbed';
import { BetaInfoButton } from './BetaInfo';
import css from './landing.module.css';

/** 改行（\n）を <br> に */
const lines = (s: string): ReactNode => s.split('\n').map((l, i, a) => <span key={i}>{l}{i < a.length - 1 && <br />}</span>);

/**
 * 紹介トップ（docs/landing-ab-guide.md）。A/B で変わるのは copy.ts の文言だけ。
 * 絵はすべて本物のエンジンで描いた見本（ダミーデータ）と、アプリの画面。
 */
export default function LandingPage({ slides }: { slides: LandingSlides }) {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  // 案：最初は A で描き、ブラウザで決まったら差し替える（決まるまで文言は見せない）
  const [variant, setVariant] = useState<{ v: Variant; ready: boolean }>({ v: 'a', ready: false });
  useEffect(() => {
    let store: Storage | null = null;
    try { store = window.localStorage; } catch { /* 保存が使えない時は A */ }
    const a = resolveVariant(new URLSearchParams(window.location.search).get('variant'), store);
    setPreviewOnly(a.forced);
    setVariant({ v: a.variant, ready: true });
  }, []);
  const loggedIn = !!auth.session;
  useEffect(() => {
    if (variant.ready && auth.session !== undefined) track('landing_view', { variant: variant.v, loggedIn, oncePerPage: true });
  }, [variant, auth.session, loggedIn]);

  const c = copyFor(variant.v, locale);
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const cta = (where: 'hero' | 'final') => (
    <Link href="/start" className={css.primary} onClick={() => track('landing_primary_cta_click', { variant: variant.v, loggedIn, detail: where })}>
      {where === 'hero' ? c.primaryCta : c.finalCta}<span aria-hidden="true">→</span>
    </Link>
  );

  return (
    <div className={css.page} data-variant={variant.v} data-ready={variant.ready ? 'true' : 'false'} data-locale={locale} lang={locale}>
      <Header loggedIn={loggedIn} />

      <main>
        {/* ヒーロー */}
        <section className={css.hero} aria-labelledby="hero-title">
          <div className={css.heroCopy}>
            <p className={css.eyebrow}>{c.eyebrow}</p>
            <h1 id="hero-title" className={css.heroTitle}>{lines(c.heading)}</h1>
            <p className={css.heroLead}>{c.description}</p>
            <div className={css.heroActions}>
              {cta('hero')}
              <a href="#examples" className={css.secondary} onClick={() => track('landing_examples_click', { variant: variant.v, loggedIn, detail: 'hero' })}>{t('landing.seeExamples')}</a>
            </div>
            <p className={css.heroNote}>{t('landing.heroNote')}</p>
            <a href="#video" className={css.videoLink}><span className={css.playDot} aria-hidden="true">▶</span>{t('landing.watchVideo')}</a>
          </div>
          <HeroVisual svg={slides.hero} />
        </section>

        {/* 01 課題・価値 */}
        <section className={css.section} aria-labelledby="problem-title">
          <div className={css.problem}>
            <div className={css.problemIntro}>
              <p className={css.index}>01 / THINK FIRST</p>
              <h2 id="problem-title" className={css.h2}>{lines(c.problemHeading)}</h2>
              <p className={css.body}>{c.problemBody}</p>
            </div>
            <div className={css.compare}>
              <div className={`${css.compareCard} ${css.compareOld}`}>
                <span className={css.compareTag}>{t('landing.compare.oldTag')}</span>
                <strong className={css.compareHead}>{t('landing.compare.oldHead')}</strong>
                <div className={css.glyphGrid} aria-hidden="true">
                  {(['TREND_COLUMN', 'MIX_SNAPSHOT', 'TREND_LINE', 'COMP_RANK', 'TREND_STACKED', 'REL_SCATTER'] as RecipeId[]).map((id) => (
                    <RecipeThumb key={id} recipe={registry.recipes[id]} className={css.glyph} />
                  ))}
                </div>
                <p className={css.compareBody}>{t('landing.compare.oldBody')}</p>
              </div>
              <span className={css.compareArrow} aria-hidden="true">→</span>
              <div className={`${css.compareCard} ${css.compareNew}`}>
                <span className={css.compareTag}>Slide Story Coach</span>
                <strong className={css.compareHead}>{t('landing.compare.newHead')}</strong>
                <div className={css.miniChat} aria-hidden="true">
                  <p className={css.bubbleUser}>{t('landing.compare.ask')}</p>
                  <p className={css.bubbleCoach}><b>{t('landing.compare.qLabel')}</b>{L(registry.recipes.TREND_CAGR_TABLE.question)}</p>
                </div>
                <p className={css.compareBody}>{t('landing.compare.newBody')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 02 使い方（3ステップ）と動画 */}
        <section className={`${css.section} ${css.tinted}`} id="how" aria-labelledby="how-title">
          <div className={css.inner}>
            <p className={css.index}>02 / HOW IT WORKS</p>
            <h2 id="how-title" className={css.h2}>{t('landing.how.title')}</h2>
            <ol className={css.steps}>
              {([1, 2, 3] as const).map((n) => (
                <li key={n} className={css.step}>
                  <div className={css.stepShot}>
                    {/* アプリの画面（見本データ） */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/landing/step-${n}-${locale}.webp`} alt={t(`landing.how.s${n}.alt`)} width={960} height={600} loading="lazy" decoding="async" />
                  </div>
                  <span className={css.stepNum}>{`0${n}`}</span>
                  <h3 className={css.h3}>{t(`landing.how.s${n}.title`)}</h3>
                  <p className={css.bodySm}>{t(`landing.how.s${n}.body`)}</p>
                </li>
              ))}
            </ol>
            <div className={css.video} id="video">
              <div className={css.videoCopy}>
                <h3 className={css.h3}>{t('landing.video.title')}</h3>
                <p className={css.bodySm}>{t('landing.video.body')}</p>
              </div>
              <VideoEmbed poster={`/landing/step-3-${locale}.webp`} />
            </div>
          </div>
        </section>

        {/* 03 見本 */}
        <section className={css.section} id="examples" aria-labelledby="examples-title">
          <div className={css.inner}>
            <div className={css.splitHead}>
              <div>
                <p className={css.index}>03 / EXAMPLES</p>
                <h2 id="examples-title" className={css.h2}>{t('landing.examples.title')}</h2>
              </div>
              <p className={css.body}>{t('landing.examples.lead')}</p>
            </div>
            <ul className={css.examples}>
              {slides.examples.map((e) => {
                const r = registry.recipes[e.id];
                return (
                  <li key={e.id} className={css.example}>
                    <div className={css.slideFrame}>
                      <div className={css.slideSvg} role="img" aria-label={L(r.name)} dangerouslySetInnerHTML={{ __html: e.svg }} />
                      <span className={css.dummy}>{t('landing.dummy')}</span>
                    </div>
                    <p className={css.exampleName}><span className={css.purposeTag}>{shortPurpose(L(registry.purposes[r.goals[0]!].label))}</span>{L(r.name)}</p>
                    <p className={css.exampleQ}>{t('landing.examples.answers', { q: L(r.question) })}</p>
                  </li>
                );
              })}
            </ul>
            <Link href="/library" className={css.textLink} onClick={() => track('landing_examples_click', { variant: variant.v, loggedIn, detail: 'library' })}>{t('landing.examples.more')} →</Link>
          </div>
        </section>

        {/* 04 PreBuilt チャート */}
        <section className={css.prebuilt} aria-labelledby="prebuilt-title">
          <div className={css.prebuiltInner}>
            <div className={css.prebuiltCopy}>
              <p className={css.indexDark}>04 / PREBUILT CHARTS</p>
              <h2 id="prebuilt-title" className={css.h2Dark}>{t('landing.prebuilt.title')}</h2>
              <p className={css.bodyDark}>{t('landing.prebuilt.body')}</p>
              <ul className={css.points}>
                {(['editable', 'ppt', 'ja'] as const).map((k) => <li key={k}>{t(`landing.prebuilt.point.${k}`)}</li>)}
              </ul>
              <Link href="/start#chart-library" className={css.textLinkDark} onClick={() => track('landing_prebuilt_click', { variant: variant.v, loggedIn })}>{t('landing.prebuilt.cta')} →</Link>
            </div>
            <div className={css.gallery}>
              <figure className={css.featured}>
                <figcaption className={css.chartName}><strong>Mekko</strong><span>{t('landing.prebuilt.mekko')}</span></figcaption>
                <div className={css.slideSvg} dangerouslySetInnerHTML={{ __html: slides.prebuilt.mekko }} />
              </figure>
              <div className={css.smallGrid}>
                {([
                  ['Waterfall', 'waterfall', slides.prebuilt.waterfall],
                  ['Slope', 'slope', slides.prebuilt.slope],
                  ['Bubble', 'bubble', slides.prebuilt.bubble],
                  ['Chart + Table', 'chartTable', slides.prebuilt.chartTable],
                ] as const).map(([name, k, svg]) => (
                  <figure key={k} className={css.small}>
                    <div className={css.slideSvg} dangerouslySetInnerHTML={{ __html: svg }} />
                    <figcaption className={css.chartName}><strong>{name}</strong><span>{t(`landing.prebuilt.${k}`)}</span></figcaption>
                  </figure>
                ))}
              </div>
              <p className={css.dummyDark}>{t('landing.dummyAll')}</p>
            </div>
          </div>
        </section>

        {/* ベータ版・安心材料 */}
        <section className={css.section} id="beta" aria-labelledby="beta-title">
          <div className={css.beta}>
            <div>
              <p className={css.index}>BETA</p>
              <h2 id="beta-title" className={css.h2}>{t('landing.beta.title')}</h2>
              <p className={css.body}>{t('landing.beta.lead')}</p>
              <div className={css.betaLinks}>
                <BetaInfoButton />
                <FeedbackButton className={css.textLink} source="landing_beta" />
              </div>
            </div>
            <ul className={css.trust}>
              {([1, 2, 3, 4] as const).map((n) => (
                <li key={n}>
                  <span className={css.trustNum}>{`0${n}`}</span>
                  <h3 className={css.h3}>{t(`landing.beta.t${n}.title`)}</h3>
                  <p className={css.bodySm}>{t(`landing.beta.t${n}.body`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 最終 CTA */}
        <section className={css.final} aria-labelledby="final-title">
          <p className={css.indexDark}>READY WHEN YOU ARE</p>
          <h2 id="final-title" className={css.h2Dark}>{lines(c.finalHeading)}</h2>
          <div className={css.finalCta}>{cta('final')}</div>
          <p className={css.finalNote}>{t('landing.final.note')}</p>
        </section>
      </main>

      <footer className={css.footer}>
        <div className={css.brandRow}><span className={css.brandMark} aria-hidden="true">S</span><b>Slide Story Coach</b><span className={css.betaBadge}>Beta</span></div>
        <p>{t('landing.footer.tagline')}</p>
        <nav className={css.footerNav} aria-label={t('landing.footer.nav')}>
          <Link href="/start">{t('nav.start')}</Link>
          <Link href="/library">{t('nav.library')}</Link>
          <FeedbackButton className={css.footerBtn} source="landing_footer" />
        </nav>
        <span className={css.copy}>© 2026 Slide Story Coach</span>
      </footer>
    </div>
  );
}

/** 「Trend（推移）」→「推移」 */
const shortPurpose = (label: string) => /（(.+)）/.exec(label)?.[1] ?? label;

/** 紹介トップ専用のヘッダー：使い方・見本・ベータ版について／言語／ログイン／主要 CTA */
function Header({ loggedIn }: { loggedIn: boolean }) {
  const t = useT();
  const auth = useAuth();
  const { locale, setLocale } = useUiLocale();
  return (
    <header className={css.header}>
      <Link href="/" className={css.brandRow} aria-label="Slide Story Coach">
        <span className={css.brandMark} aria-hidden="true">S</span><b>Slide Story Coach</b><span className={css.betaBadge}>Beta</span>
      </Link>
      <nav className={css.nav} aria-label={t('nav.label')}>
        <a href="#how">{t('landing.nav.how')}</a>
        <a href="#examples">{t('landing.nav.examples')}</a>
        <a href="#beta">{t('landing.nav.beta')}</a>
      </nav>
      <div className={css.headRight}>
        <div className={css.lang} role="group" aria-label={t('app.uiLanguage')}>
          {LOCALES.map((l) => <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)}>{l === 'ja' ? '日本語' : 'EN'}</button>)}
        </div>
        {loggedIn ? <Link href="/charts" className={css.headLink}>{t('nav.myPage')}</Link> : <div className={css.headAccount}><AccountMenu auth={auth} /></div>}
        <Link href="/start" className={css.headCta}>{loggedIn ? t('landing.header.startLoggedIn') : <><span className={css.wide}>{t('landing.header.start')}</span><span className={css.narrow}>{t('landing.header.startShort')}</span></>}</Link>
      </div>
    </header>
  );
}

/** ヒーローの絵：相談 → AI が読み取った問い → おすすめの切り口 → 完成スライド（本物のエンジンで描いた見本） */
function HeroVisual({ svg }: { svg: string }) {
  const t = useT();
  const locale = useLocale();
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const picks: RecipeId[] = ['TREND_CAGR_TABLE', 'START_END_CAGR', 'TREND_SLOPE'];
  return (
    <div className={css.stage} aria-label={t('landing.hero.visualLabel')} role="img">
      <div className={`${css.card} ${css.consult}`}>
        <p className={css.cardLabel}><span className={css.cardNum}>1</span>{t('landing.hero.consult')}</p>
        <p className={css.consultText}>{t('entry.ai.example')}<span className={css.caret} aria-hidden="true" /></p>
        <p className={css.readout}><span>{t('landing.hero.readout')}</span>{L(registry.recipes.TREND_CAGR_TABLE.question)}</p>
      </div>
      <div className={`${css.card} ${css.picks}`}>
        <p className={css.cardLabel}><span className={css.cardNum}>2</span>{t('landing.hero.picks')}</p>
        <ul>
          {picks.map((id, i) => (
            <li key={id} className={i === 0 ? css.pickOn : undefined}>
              <RecipeThumb recipe={registry.recipes[id]} className={css.pickThumb} />
              <span className={css.pickName}>{L(registry.recipes[id].name)}</span>
              {i === 0 && <span className={css.pickBadge}>{t('entry.recommended')}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className={`${css.card} ${css.slide}`}>
        <p className={css.cardLabel}><span className={css.cardNum}>3</span>{t('landing.hero.slide')}<span className={css.pptBadge}>PowerPoint</span></p>
        <div className={css.slideSvg} dangerouslySetInnerHTML={{ __html: svg }} />
        <span className={css.dummy}>{t('landing.dummy')}</span>
      </div>
    </div>
  );
}
