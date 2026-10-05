import { getT } from "@/lib/i18n/server";
import type { AdminOverview } from "@/lib/admin";
import type { performance } from "@/lib/diagnostic";
import { DiagnosticPanel } from "@/components/DiagnosticPanel";
import { addAllowedEmail, removeAllowedEmail, setGeneration, setMonthlyCap } from "@/app/admin/actions";

const euros = (cents: number) => `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

const STAGES: Record<string, string> = {
  comprehension: "Compréhension",
  explication: "Explication",
  ocr: "Lecture OCR",
  verification: "Vérification",
  quiz: "Correction de quiz",
  quiz_gen: "Me tester (QCM)",
  ask: "Questions au document",
};

/** Tableau de bord d'administration (données chargées par la page, côté serveur). */
const seconds = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`);

export async function AdminView({
  o,
  perf,
  userEmail,
  message,
}: {
  o: AdminOverview;
  perf: Awaited<ReturnType<typeof performance>> | null;
  userEmail: string | null;
  message?: string;
}) {
  const t = await getT();
  const monthPct = o.monthlyCapCents ? Math.min(100, Math.round((o.spentMonthCents / o.monthlyCapCents) * 100)) : 100;
  const models = o.quota.configured.length
    ? [...new Set([...o.quota.configured, ...o.quota.models.map(([m]) => m)])]
    : o.quota.models.map(([m]) => m);
  const used = new Map(o.quota.models);

  return (
    <>
      <h1>{t.admin.title}</h1>
      {message && <p className="notice" role="status">{message.slice(0, 200)}</p>}

      <section className="admin-section" aria-labelledby="adm-budget">
        <h2 id="adm-budget">{t.admin.spending}</h2>
        <dl className="stats">
          <div><dt>{t.admin.month}</dt><dd>{euros(o.spentMonthCents)} <span className="muted">/ {euros(o.monthlyCapCents)}</span></dd></div>
          <div><dt>{t.admin.last24h}</dt><dd>{euros(o.spent24hCents)} <span className="muted">/ {euros(o.dailyAccountCapCents)} {t.admin.perAccount}</span></dd></div>
          <div><dt>{t.admin.reports}</dt><dd>{o.reportCount}</dd></div>
        </dl>
        <label htmlFor="month-meter">{t.admin.monthUse(monthPct)}</label>
        <meter id="month-meter" min={0} max={100} low={70} high={90} optimum={0} value={monthPct}>{monthPct} %</meter>
        {o.byStage.length > 0 && (
          <table className="admin-table">
            <caption className="sr-only">{t.admin.byStage}</caption>
            <thead><tr><th scope="col">{t.admin.stage}</th><th scope="col">{t.admin.cost}</th></tr></thead>
            <tbody>{o.byStage.map(([stage, c]) => <tr key={stage}><td>{STAGES[stage] ?? stage}</td><td>{euros(c)}</td></tr>)}</tbody>
          </table>
        )}
        <p className="muted small">{t.admin.estimateNote}</p>
      </section>

      <section className="admin-section" aria-labelledby="adm-quota">
        <h2 id="adm-quota">{t.admin.quota}</h2>
        <p className="muted">{t.admin.quotaIntro(o.quota.limit, when(o.quota.since.toISOString()))}</p>
        {models.length === 0 ? (
          <p className="muted">{t.admin.noRequests}</p>
        ) : (
          models.map((m) => {
            const n = used.get(m) ?? 0;
            return (
              <div key={m} className="quota-row">
                <label htmlFor={`q-${m}`}><code>{m}</code> : {n} / {o.quota.limit}</label>
                <meter id={`q-${m}`} min={0} max={o.quota.limit} low={o.quota.limit * 0.7} high={o.quota.limit * 0.9} optimum={0} value={Math.min(n, o.quota.limit)}>{n}</meter>
              </div>
            );
          })
        )}
      </section>

      <section className="admin-section" aria-labelledby="adm-diag">
        <h2 id="adm-diag">{t.admin.diagnostic}</h2>
        <p className="muted">{t.admin.diagIntro}</p>
        <DiagnosticPanel />
      </section>

      {perf && (
        <section className="admin-section" aria-labelledby="adm-perf">
          <h2 id="adm-perf">{t.admin.performance}</h2>
          <p className="muted">
            {t.admin.perfReports(perf.reports.count, seconds(perf.reports.p50), seconds(perf.reports.p95))}
            {perf.reports.successRate !== null && ` ${t.admin.perfSuccess(Math.round(perf.reports.successRate * 100))}`}
          </p>
          {perf.stages.length > 0 && (
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t.admin.perfTable}>
              <table className="admin-table">
                <thead><tr><th scope="col">{t.admin.stage}</th><th scope="col">{t.admin.calls}</th><th scope="col">p50</th><th scope="col">p95</th><th scope="col">{t.admin.avgCost}</th></tr></thead>
                <tbody>
                  {perf.stages.map((x) => (
                    <tr key={x.stage}>
                      <td>{STAGES[x.stage] ?? x.stage}</td>
                      <td>{x.calls}</td>
                      <td>{seconds(x.p50)}</td>
                      <td>{seconds(x.p95)}</td>
                      <td>{euros(Math.round(x.avgCents * 100) / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="admin-section" aria-labelledby="adm-switch">
        <h2 id="adm-switch">{t.admin.circuit}</h2>
        <form action={setGeneration} className="admin-form">
          <label className="consent">
            <input type="checkbox" name="enabled" defaultChecked={o.generationEnabled} />
            <span>{t.admin.generationEnabled}</span>
          </label>
          <button type="submit" className="btn">{t.admin.save}</button>
        </form>
        <form action={setMonthlyCap} className="admin-form">
          <label htmlFor="cap">{t.admin.capLabel(o.envCapCents / 100)}</label>
          <input id="cap" name="euros" type="number" inputMode="decimal" min={0} max={o.envCapCents / 100} step="0.5" defaultValue={o.monthlyCapCents / 100} />
          <button type="submit" className="btn">{t.admin.save}</button>
        </form>
      </section>

      <section className="admin-section" aria-labelledby="adm-allow">
        <h2 id="adm-allow">{t.admin.allowlist}</h2>
        <ul className="allow-list">
          {o.emails.map((e) => (
            <li key={e.email}>
              <span className="allow-email">{e.email}</span>
              <span className="badge">{e.role === "admin" ? t.admin.roleAdmin : t.admin.roleUser}</span>
              {e.email !== userEmail?.toLowerCase() && (
                <form action={removeAllowedEmail}>
                  <input type="hidden" name="email" value={e.email} />
                  <button type="submit" className="btn-link" aria-label={t.admin.removeLabel(e.email)}>{t.admin.remove}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <form action={addAllowedEmail} className="admin-form">
          <label htmlFor="new-email">{t.admin.addLabel}</label>
          <input id="new-email" name="email" type="email" autoComplete="off" required />
          <label htmlFor="new-role">{t.admin.role}</label>
          <select id="new-role" name="role" defaultValue="user">
            <option value="user">{t.admin.roleUser}</option>
            <option value="admin">{t.admin.roleAdmin}</option>
          </select>
          <button type="submit" className="btn">{t.admin.add}</button>
        </form>
      </section>

      <section className="admin-section" aria-labelledby="adm-jobs">
        <h2 id="adm-jobs">{t.admin.jobs}</h2>
        {o.jobs.length === 0 ? <p className="muted">{t.admin.none}</p> : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label={t.admin.jobsTable}>
            <table className="admin-table">
              <thead><tr><th scope="col">{t.admin.date}</th><th scope="col">{t.admin.kind}</th><th scope="col">{t.admin.status}</th><th scope="col">{t.admin.error}</th></tr></thead>
              <tbody>
                {o.jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{when(j.created_at)}</td>
                    <td>{t.admin.kinds[j.kind] ?? j.kind}</td>
                    <td>{t.reports.status[j.status] ?? j.status}</td>
                    <td><code>{j.error_code ?? "—"}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section" aria-labelledby="adm-audit">
        <h2 id="adm-audit">{t.admin.audit}</h2>
        {o.audit.length === 0 ? <p className="muted">{t.admin.none}</p> : (
          <ul className="audit-list">
            {o.audit.map((a, i) => <li key={i}><span className="muted">{when(a.created_at)}</span> <code>{a.action}</code></li>)}
          </ul>
        )}
      </section>
    </>
  );
}
