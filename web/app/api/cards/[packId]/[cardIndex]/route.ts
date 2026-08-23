import { getScheduledPack } from "@/lib/schedule";

type RouteContext = {
  params: Promise<{ packId: string; cardIndex: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { packId, cardIndex } = await context.params;
  const pack = getScheduledPack(packId);
  const index = Number(cardIndex);
  if (!pack || !Number.isSafeInteger(index) || index < 0 || index >= pack.cards.length) {
    return new Response("Card image not found", { status: 404 });
  }

  const source = await fetch(pack.cards[index].image, {
    headers: {
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      "User-Agent": "P1P1/1.0 (card image cache)",
    },
  });
  if (!source.ok || !source.body) {
    return new Response("Card image unavailable", { status: 502 });
  }

  return new Response(source.body, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
      "CDN-Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": source.headers.get("content-type") ?? "image/jpeg",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
