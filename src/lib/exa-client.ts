/* eslint-disable no-console */
/**
 * Exa Search API 客户端
 * 对影片名/关键词进行外部搜索，返回摘要、链接等参考信息
 */
export interface ExaSearchResult {
  title: string;
  url: string;
  publishedDate?: string;
  text: string;
  favicon?: string;
}
const EXA_API_KEY = process.env.EXA_API_KEY || "";
const EXA_BASE_URL = "https://api.exa.ai/search";
export function hasExaKey(): boolean { return !!EXA_API_KEY && EXA_API_KEY.length > 10; }
export async function searchMovie(query: string): Promise<ExaSearchResult[]> {
  if (!hasExaKey()) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(EXA_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": EXA_API_KEY,
      },
      body: JSON.stringify({
        query: query + " movie tv drama film review rating",
        numResults: 5,
        useAutoprompt: true,
        type: "neural",
        contents: { text: { maxCharacters: 300 } }
      }),
      signal: ctrl.signal
    });
    if (!r.ok) {
  // eslint-disable-next-line no-console
  console.error("Exa HTTP " + r.status); return []; }
    const d = await r.json();
    return (d.results || []).map((item: any) => ({
      title: item.title || "",
      url: item.url || "",
      publishedDate: item.publishedDate || undefined,
      text: item.text || "",
      favicon: item.favicon || undefined,
    }));
  } catch (e: any) {
  // eslint-disable-next-line no-console
  console.error("Exa err:", e.message); return []; }
  finally { clearTimeout(timer); }
}
