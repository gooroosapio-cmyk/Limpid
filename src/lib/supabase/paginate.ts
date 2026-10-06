/**
 * Lecture complète d'une requête PostgREST, par pages : l'API plafonne chaque réponse
 * (1 000 lignes par défaut), ce qui tronquerait un long document (≈ 10 segments par page).
 */
const PAGE = 1_000;

export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 50_000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}
