// Netlify serverless function: fetches AI safety news from NewsAPI
// Called by the frontend weekly, results cached in localStorage

const NEWSAPI_KEY = process.env.NEWSAPI_KEY || "";

const QUERIES = [
  // Global AI safety / ethics / regulation — strict AI terms required
  '("AI safety" OR "AI regulation" OR "AI ethics" OR "AI governance" OR "AI Act" OR "artificial intelligence regulation" OR "artificial intelligence safety" OR "artificial intelligence ethics" OR "generative AI risk" OR "AI bias" OR "AI accountability" OR "responsible AI" OR "AI policy" OR "AI transparency") NOT stock NOT crypto NOT airline NOT aviation NOT airways',
  // India-specific AI safety / regulation news — must mention both AI and India context
  '("artificial intelligence" OR "AI regulation" OR "AI safety" OR "AI ethics" OR "AI governance" OR "deepfake" OR "AI policy" OR "AI Act") AND ("India" OR "DPDP" OR "MEITY" OR "NITI Aayog" OR "IndiaAI") NOT stock NOT crypto NOT airline NOT aviation NOT airways NOT cricket',
];

// Keywords that MUST appear in title or description to confirm article is about AI
const AI_RELEVANCE_KEYWORDS = /\b(artificial intelligence|AI |AI-|machine learning|deep learning|deepfake|generative AI|large language model|LLM|GPT|neural network|algorithm|ChatGPT|AI safety|AI regulation|AI ethics|AI governance|AI bias|AI policy|responsible AI|AI act|AI transparency|AI accountability|facial recognition|automated decision|AI risk)\b/i;

const TAG_COLORS = ["#ef4444", "#f97316", "#eab308", "#a855f7", "#06b6d4", "#10b981"];

export default async (req) => {
  if (!NEWSAPI_KEY) {
    return new Response(JSON.stringify({ error: "NEWSAPI_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    // Fetch global AI safety news
    const globalUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(QUERIES[0])}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${NEWSAPI_KEY}`;
    const globalRes = await fetch(globalUrl);
    const globalData = await globalRes.json();

    // Fetch India-specific AI news
    const indiaUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(QUERIES[1])}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${NEWSAPI_KEY}`;
    const indiaRes = await fetch(indiaUrl);
    const indiaData = await indiaRes.json();

    // Combine and deduplicate
    const allArticles = [
      ...(indiaData.articles || []).map(a => ({ ...a, _isIndia: true })),
      ...(globalData.articles || []),
    ];

    // Deduplicate by title similarity AND filter for AI relevance
    const seen = new Set();
    const unique = allArticles.filter(a => {
      if (!a.title || a.title === "[Removed]") return false;
      const key = a.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      // STRICT RELEVANCE CHECK: title or description must mention AI-related terms
      const text = `${a.title} ${a.description || ""} ${a.content || ""}`;
      if (!AI_RELEVANCE_KEYWORDS.test(text)) return false;
      return true;
    });

    // Ensure at least 1 India article is in the top 6
    const indiaArticles = unique.filter(a => a._isIndia);
    const globalArticles = unique.filter(a => !a._isIndia);

    // Build final list: 1 India + 5 global (or best effort)
    const final = [];
    if (indiaArticles.length > 0) final.push(indiaArticles[0]);
    for (const a of globalArticles) {
      if (final.length >= 6) break;
      final.push(a);
    }
    // Fill remaining with India if we have them
    for (const a of indiaArticles.slice(1)) {
      if (final.length >= 6) break;
      final.push(a);
    }

    // Format for frontend
    const formatted = final.map((a, i) => {
      const date = new Date(a.publishedAt);
      const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
      const isIndia = a._isIndia || (a.title && (a.title.includes("India") || a.title.includes("DPDP") || a.title.includes("MEITY") || a.title.includes("NITI Aayog") || a.title.includes("IndiaAI")));

      return {
        tag: isIndia ? `INDIA · ${dateStr}` : dateStr,
        tagColor: isIndia ? "#f97316" : TAG_COLORS[i % TAG_COLORS.length],
        headline: a.title,
        body: a.description || a.content?.slice(0, 200) || "",
        url: a.url,
        source: a.source?.name || "",
        isIndia,
      };
    });

    return new Response(JSON.stringify({
      articles: formatted,
      fetchedAt: new Date().toISOString(),
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400", // CDN caches for 1 day
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
};
