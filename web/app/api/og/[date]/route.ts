import { env } from "cloudflare:workers";
import { getScheduledDay, utcDate } from "@/lib/schedule";

type ImagesBinding = {
  input(stream: ReadableStream): {
    transform(options: Record<string, unknown>): {
      output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
    };
  };
};

type RuntimeEnv = {
  IMAGES?: ImagesBinding;
};

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { date } = await context.params;
  const day = date <= utcDate() ? getScheduledDay(date) : undefined;
  if (!day) return new Response("Puzzle not found", { status: 404 });

  const images = (env as RuntimeEnv).IMAGES;
  if (!images) return new Response("Image service unavailable", { status: 503 });

  const cardBacks = Array.from({ length: day.cards.length }, (_, index) => {
    const x = 92 + index * 62;
    const y = 390 + Math.abs(6.5 - index) * 5;
    const rotation = (index - 6.5) * 1.4;
    return `<rect x="${x}" y="${y}" width="118" height="164" rx="12" fill="#1f3d2a" stroke="#e0bd72" stroke-width="3" transform="rotate(${rotation} ${x + 59} ${y + 82})"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs><radialGradient id="paper"><stop stop-color="#fffaf0"/><stop offset="1" stop-color="#e7e0d1"/></radialGradient></defs>
    <rect width="1200" height="630" fill="url(#paper)"/>
    <circle cx="1060" cy="80" r="260" fill="#375b43" opacity=".10"/>
    <text x="76" y="92" fill="#191c18" font-family="ui-monospace, monospace" font-size="34" font-weight="800" letter-spacing="-2">P1P1<tspan fill="#b78a3d">.</tspan></text>
    <text x="76" y="205" fill="#375b43" font-family="ui-monospace, monospace" font-size="18" font-weight="700" letter-spacing="3">PACK 1 · PICK 1 · ${day.set}</text>
    <text x="76" y="292" fill="#191c18" font-family="Georgia, serif" font-size="68">What’s your first pick?</text>
    <text x="78" y="340" fill="#686a61" font-family="ui-sans-serif, sans-serif" font-size="24">${date} · ${day.cards.length} cards · one decision</text>
    ${cardBacks}
  </svg>`;

  const transformed = await images
    .input(new Blob([svg], { type: "image/svg+xml" }).stream())
    .transform({ width: 1200, height: 630, fit: "scale-down" })
    .output({ format: "image/png", quality: 90 });
  const source = transformed.response();
  return new Response(source.body, {
    status: source.status,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
