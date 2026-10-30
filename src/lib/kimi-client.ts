/* eslint-disable no-console */
/**
 * Kimi LLM 客户端 - parse natural queries via Kimi API
 * LLM fallback for local rules in natural-query.ts
 */
export interface KimiSearchParams {
  doubanType: "tv" | "movie";
  doubanTag: string;
  searchTerms: string[];
  group: "mood" | "genre" | "scene" | "audience";
  explanation: string;
}
const KIMI_API_KEY = process.env.KIMI_API_KEY || "";
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.kimi.com/coding/v1";
export function hasKimiKey(): boolean { return !!KIMI_API_KEY && KIMI_API_KEY.length > 10; }
const SYSTEM_PROMPT = "You are a movie/TV search intent parser. Output ONLY JSON: {\"doubanType\":\"tv\"|\"movie\",\"doubanTag\":\"comedy|suspense|scifi|action|romance|horror|animation|documentary|chinese-drama|korean-drama|us-drama|japanese-drama|top-rated|vintage\",\"searchTerms\":[\"kw1\",\"kw2\"],\"group\":\"mood|genre|scene|audience\",\"explanation\":\"brief Chinese explanation <30 chars\"}. Use tv for series, else movie.";
export async function parseWithKimi(query: string): Promise<KimiSearchParams | null> {
  if (!hasKimiKey()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(KIMI_BASE_URL + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + KIMI_API_KEY },
      body: JSON.stringify({ model: "kimi-latest", messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query }
      ], temperature: 1, max_tokens: 300 }),
      signal: ctrl.signal
    });
    if (!r.ok) {
  // eslint-disable-next-line no-console
  console.error("Kimi HTTP " + r.status); return null; }
    const d = await r.json();
    const txt = d?.choices?.[0]?.message?.content || "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) {
  // eslint-disable-next-line no-console
  console.error("Kimi no JSON"); return null; }
    const p = JSON.parse(m[0]);
    if (!p.doubanType || !p.doubanTag || !p.searchTerms?.length) return null;
    return {
      doubanType: p.doubanType === "tv" ? "tv" : "movie",
      doubanTag: p.doubanTag,
      searchTerms: p.searchTerms.slice(0, 5),
      group: ["mood","genre","scene","audience"].includes(p.group) ? p.group : "genre",
      explanation: p.explanation || p.doubanTag
    };
  } catch (e: any) {
  // eslint-disable-next-line no-console
  console.error("Kimi err:", e.message); return null; }
  finally { clearTimeout(timer); }
}
