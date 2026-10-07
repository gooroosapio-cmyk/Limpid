import type { Metadata } from "next";
import Link from "next/link";
import { Icon, ICON_NAMES } from "@/components/Icon";
import { Screen } from "@/components/shell/Screen";
import { requireAdmin } from "@/lib/admin";
import { contrastMatrix, ROLES, SURFACES, TEXT } from "@/lib/design/palette";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.admin.charte.title };
}

const ROLE_ORDER = ["ink", "muted", "notion", "alert", "success", "example"] as const;
// Classes et non attributs style : la CSP n'autorise pas les styles en ligne.
const roleClass: Record<(typeof ROLE_ORDER)[number], { dot: string; text: string }> = {
  ink: { dot: "tw:bg-ink", text: "tw:text-ink" },
  muted: { dot: "tw:bg-muted", text: "tw:text-muted" },
  notion: { dot: "tw:bg-notion", text: "tw:text-notion" },
  alert: { dot: "tw:bg-alert", text: "tw:text-alert" },
  success: { dot: "tw:bg-success", text: "tw:text-success" },
  example: { dot: "tw:bg-example", text: "tw:text-example" },
};
const ROLE_ICONS = [
  { icon: "definition", role: "notion" },
  { icon: "formula", role: "notion" },
  { icon: "key-idea", role: "alert" },
  { icon: "caution", role: "alert" },
  { icon: "example", role: "example" },
  { icon: "analogy", role: "example" },
  { icon: "success", role: "success" },
] as const;
const surfaceClass: Record<keyof typeof SURFACES, string> = { bg: "tw:bg-bg", surface: "tw:bg-surface", elevated: "tw:bg-elevated" };
const PAIRS = { ...TEXT, ...ROLES };

/** Les deux thèmes côte à côte (.scheme-light / .scheme-dark redéclarent les jetons). */
function Themes({ children, labels }: { children: React.ReactNode; labels: [string, string] }) {
  return (
    <div className="tw:grid tw:gap-3 tw:md:grid-cols-2">
      {(["light", "dark"] as const).map((scheme, i) => (
        <div key={scheme} className={`scheme-${scheme} tw:rounded-card tw:border tw:border-line tw:bg-bg tw:p-4 tw:text-ink`}>
          <p className="tw:mb-3 tw:text-caption tw:font-semibold tw:uppercase tw:tracking-label tw:text-muted">{labels[i]}</p>
          {children}
        </div>
      ))}
    </div>
  );
}

export default async function ChartePage() {
  await requireAdmin();
  const t = (await getT()).admin.charte;
  const labels: [string, string] = [t.light, t.dark];
  const rows = contrastMatrix();
  return (
    <Screen wide>
      <p className="tw:text-sm"><Link href="/admin">← {(await getT()).admin.title}</Link></p>
      <h1>{t.title}</h1>
      <p className="lede">{t.intro}</p>

      <section className="tw:mt-8 tw:grid tw:gap-4" aria-labelledby="ch-text">
        <h2 id="ch-text">{t.textTitle}</h2>
        <p className="tw:text-muted">{t.textIntro}</p>
        <Themes labels={labels}>
          <ul className="tw:m-0 tw:grid tw:list-none tw:gap-3 tw:p-0">
            {ROLE_ORDER.map((r) => (
              <li key={r} className="tw:grid tw:grid-cols-[28px_1fr] tw:items-start tw:gap-3">
                <span className={`tw:mt-1 tw:block tw:size-5 tw:rounded-pill ${roleClass[r].dot}`} aria-hidden="true" />
                <div>
                  <p className={`tw:text-sm tw:font-semibold ${roleClass[r].text}`}>{t.roles[r][0]}</p>
                  <p className="tw:text-caption tw:text-muted">{t.roles[r][1]} · {PAIRS[r].light} / {PAIRS[r].dark}</p>
                </div>
              </li>
            ))}
          </ul>
        </Themes>
      </section>

      <section className="tw:mt-8 tw:grid tw:gap-4" aria-labelledby="ch-hl">
        <h2 id="ch-hl">{t.highlightTitle}</h2>
        <Themes labels={labels}>
          <div className="tw:grid tw:gap-4 tw:text-base">
            <div>
              <p className="tw:text-caption tw:text-muted">{t.mark}</p>
              <p><mark>{t.markSample}</mark></p>
            </div>
            <div>
              <p className="tw:text-caption tw:text-muted">{t.tint}</p>
              <p className="tw:flex tw:flex-wrap tw:gap-2">
                {(["notion", "alert", "success", "example"] as const).map((r) => (
                  <span key={r} className={`hl-role role-${r}`}>{t.roles[r][0]}</span>
                ))}
              </p>
            </div>
            <div>
              <p className="tw:text-caption tw:text-muted">{t.linkRule}</p>
              <p><a href="#ch-hl">{t.sample}</a></p>
            </div>
            <div>
              <p className="tw:text-caption tw:text-muted">{t.term}</p>
              <p>{t.sample.split(" ").slice(0, -3).join(" ")} <span className="u-term role-notion">{t.sample.split(" ").slice(-3).join(" ")}</span></p>
            </div>
          </div>
        </Themes>
      </section>

      <section className="tw:mt-8 tw:grid tw:gap-3" aria-labelledby="ch-rules">
        <h2 id="ch-rules">{t.rulesTitle}</h2>
        <ol className="tw:grid tw:list-decimal tw:gap-2 tw:pl-5 tw:text-base">
          {t.rules.map((r) => <li key={r}>{r}</li>)}
        </ol>
      </section>

      <section className="tw:mt-8 tw:grid tw:gap-4" aria-labelledby="ch-surf">
        <h2 id="ch-surf">{t.surfacesTitle}</h2>
        <Themes labels={labels}>
          <div className="tw:flex tw:flex-wrap tw:gap-3">
            {(Object.keys(SURFACES) as (keyof typeof SURFACES)[]).map((k) => (
              <div key={k} className="tw:grid tw:gap-1 tw:text-caption tw:text-muted">
                <span className={`tw:block tw:h-12 tw:w-20 tw:rounded-control tw:border tw:border-line ${surfaceClass[k]}`} />
                {k}
              </div>
            ))}
            <div className="tw:grid tw:gap-1 tw:text-caption tw:text-muted">
              <span className="tw:flex tw:h-12 tw:w-20 tw:items-center tw:justify-center tw:rounded-control tw:bg-yellow tw:text-sm tw:font-semibold tw:text-on-yellow">Aa</span>
              accent
            </div>
          </div>
        </Themes>
      </section>

      <section className="tw:mt-8 tw:grid tw:gap-3" aria-labelledby="ch-contrast">
        <h2 id="ch-contrast">{t.contrastTitle}</h2>
        <div className="tw:overflow-x-auto">
          <table className="tw:w-full tw:text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.mode}-${r.label}`} className="tw:border-b tw:border-line">
                  <td className="tw:py-1 tw:pr-3 tw:font-mono">{r.label}</td>
                  <td className="tw:py-1 tw:pr-3 tw:text-muted">{r.mode === "light" ? t.light : t.dark}</td>
                  <td className="tw:py-1 tw:text-right tw:font-mono">{r.ratio.toFixed(2)}:1</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tw:mt-8 tw:grid tw:gap-4" aria-labelledby="ch-role-icons">
        <h2 id="ch-role-icons">{t.roleIconsTitle}</h2>
        <p className="tw:text-muted">{t.roleIconsIntro}</p>
        <Themes labels={labels}>
          <ul className="tw:m-0 tw:flex tw:list-none tw:flex-wrap tw:gap-x-5 tw:gap-y-3 tw:p-0">
            {ROLE_ICONS.map((r) => (
              <li key={r.icon} className={`role-${r.role} text-role tw:flex tw:items-center tw:gap-2 tw:text-caption tw:font-bold tw:uppercase tw:tracking-label`}>
                <Icon name={r.icon} size={16} />
                {t.roleIconLabels[r.icon]}
              </li>
            ))}
            <li className="tw:flex tw:items-center tw:gap-2 tw:text-caption tw:font-bold tw:uppercase tw:tracking-label">
              <span className="hl-mark tw:flex tw:items-center tw:gap-2"><Icon name="retain" size={16} />{t.roleIconLabels.retain}</span>
            </li>
          </ul>
        </Themes>
      </section>

      <section className="tw:mt-8 tw:grid tw:gap-3" aria-labelledby="ch-icons">
        <h2 id="ch-icons">{t.iconsTitle}</h2>
        <ul className="tw:m-0 tw:grid tw:list-none tw:grid-cols-[repeat(auto-fill,minmax(88px,1fr))] tw:gap-2 tw:p-0">
          {ICON_NAMES.map((n) => (
            <li key={n} className="tw:grid tw:justify-items-center tw:gap-1 tw:rounded-control tw:border tw:border-line tw:p-2 tw:text-caption tw:text-muted">
              <Icon name={n} size={24} />
              {n}
            </li>
          ))}
        </ul>
      </section>
    </Screen>
  );
}
