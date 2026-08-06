// The edge worker for superb.works: every request passes through here
// before the static artifact answers. It exists for one route.
//
// /catalogue/* serves the book library from our own domain -- proxied from
// the public library repository (superb-catalogue/library@main) and cached
// at the edge. Readers and the app fetch it freely, same as ever. An AI
// crawler gets HTTP 402 Payment Required instead, in the x402 response
// shape, so the day a wallet is configured the price fields light up and
// nothing else changes. Until then the 402 carries the terms in plain
// words. Serving the shelf from our own zone is what makes any of this
// enforceable: a zone is something Cloudflare's crawler controls (and Pay
// Per Crawl, when it opens up) can act on; a public CDN mirror is not.
//
// What this does not claim: the library repository itself is public, and
// the books are public domain. A crawler that goes around us to GitHub can
// still read them. The 402 prices access to *our serving* -- the assembled,
// deduplicated, glossed shelf on our infrastructure -- which is the thing
// we pay to operate. Locking the data itself would mean a private
// repository and R2-only serving; scripts/upload_r2.py in the library
// repository is ready for that day.

const CATALOGUE_ORIGIN = "https://raw.githubusercontent.com/superb-catalogue/library/main";

// Crawlers that identify as AI data/agent collectors, by their own
// published user-agent strings. Ordinary search indexing (Googlebot,
// Bingbot) is deliberately absent: the library page is meant to be found.
const AI_CRAWLERS = new RegExp(
  [
    "GPTBot", "OAI-SearchBot", "ChatGPT-User",
    "ClaudeBot", "Claude-Web", "Claude-User", "anthropic-ai",
    "CCBot", "Google-Extended", "Applebot-Extended",
    "Bytespider", "PerplexityBot", "Perplexity-User",
    "Amazonbot", "meta-externalagent", "meta-externalfetcher",
    "cohere-ai", "cohere-training-data-crawler",
    "Diffbot", "omgili", "webzio-extended", "Timpibot",
    "YouBot", "AI2Bot", "ImagesiftBot", "DuckAssistBot",
    "PanguBot", "Kangaroo Bot", "Sidetrade indexer bot",
  ].join("|"),
  "i",
);

// One path shape is servable: repository-relative files the uploader also
// mirrors. Anything else under /catalogue/ is 404, never a proxy of
// arbitrary GitHub paths.
const SERVABLE = /^(books\/[a-z0-9._-]+\/(book|provenance|glosses)\.json|books\/INDEX\.json|LIBRARY\.md|CATEGORIES\.md|README\.md|NOTICE\.md|LICENSE)$/;

function paymentRequired(url, env) {
  // The x402 envelope. With no wallet configured yet, `accepts` is empty
  // and `error` says what to do; configuring PAY_TO/PAY_ASSET/PAY_PRICE
  // as Pages env vars fills it in without another deploy.
  const accepts = [];
  if (env && env.PAY_TO) {
    accepts.push({
      scheme: "exact",
      network: env.PAY_NETWORK || "base",
      maxAmountRequired: env.PAY_PRICE || "1000",
      resource: url.pathname,
      description: "One file from the Superb catalogue, served from superb.works",
      payTo: env.PAY_TO,
      asset: env.PAY_ASSET || "",
      maxTimeoutSeconds: 60,
    });
  }
  return new Response(
    JSON.stringify(
      {
        x402Version: 1,
        error:
          "This shelf is free for people and for the Superb app, and priced for AI crawlers. " +
          "The books are public domain; the assembled, deduplicated, glossed serving of them is ours. " +
          "No payment rail is configured yet -- write to the address on superb.works if you want bulk access.",
        accepts,
      },
      null,
      2,
    ),
    {
      status: 402,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

async function catalogue(request, url, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("method not allowed", { status: 405 });
  }
  const ua = request.headers.get("user-agent") || "";
  if (AI_CRAWLERS.test(ua)) return paymentRequired(url, env);

  const key = url.pathname.slice("/catalogue/".length);
  if (!SERVABLE.test(key)) return new Response("not found", { status: 404 });

  const upstream = await fetch(`${CATALOGUE_ORIGIN}/${key}`, {
    cf: { cacheEverything: true, cacheTtl: 3600 },
  });
  if (!upstream.ok) {
    return new Response("not found", { status: upstream.status === 404 ? 404 : 502 });
  }
  const headers = new Headers();
  headers.set(
    "content-type",
    key.endsWith(".json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
  );
  // An hour at the edge and in the browser; the shelf changes by commit,
  // not by the minute. CORS stays open: the same files a person may read
  // on GitHub are not a secret here -- the 402 above is about crawlers,
  // not about readers.
  headers.set("cache-control", "public, max-age=3600");
  headers.set("access-control-allow-origin", "*");
  return new Response(upstream.body, { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/catalogue" || url.pathname.startsWith("/catalogue/")) {
      return catalogue(request, url, env);
    }
    return env.ASSETS.fetch(request);
  },
};
