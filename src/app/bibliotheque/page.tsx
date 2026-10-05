import { redirect } from "next/navigation";

/** La bibliothèque est la page principale. */
export default async function LibraryRedirect({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = new URLSearchParams(await searchParams);
  const q = sp.toString();
  redirect(q ? `/?${q}` : "/");
}
