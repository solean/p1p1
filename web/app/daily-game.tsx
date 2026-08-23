"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GameState, Reveal } from "@/lib/game";
import type { PublicPuzzle } from "@/lib/schedule";

type DailyGameProps = {
  endpoint: string;
  initialPuzzle: PublicPuzzle;
  isToday: boolean;
};

function formatShare(share: number): string {
  const percentage = share * 100;
  return percentage < 0.1 ? "<0.1%" : `${percentage.toFixed(1)}%`;
}

function formatWinRate(winRate: number | null): string {
  return winRate === null ? "Unrated" : `${(winRate * 100).toFixed(1)}% win rate`;
}

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object" || !("puzzle" in value)) return false;
  const puzzle = value.puzzle;
  if (
    !puzzle ||
    typeof puzzle !== "object" ||
    !("date" in puzzle) ||
    typeof puzzle.date !== "string" ||
    !("cards" in puzzle) ||
    !Array.isArray(puzzle.cards)
  ) {
    return false;
  }
  return (
    "selectedCard" in value &&
    (value.selectedCard === null || typeof value.selectedCard === "string") &&
    "reveal" in value &&
    (value.reveal === null || (typeof value.reveal === "object" && value.reveal !== null))
  );
}

function errorMessage(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string") {
    return value.error;
  }
  return fallback;
}

export function DailyGame({ endpoint, initialPuzzle, isToday }: DailyGameProps) {
  const [game, setGame] = useState<GameState>({
    puzzle: initialPuzzle,
    selectedCard: null,
    reveal: null,
  });
  const [hydrating, setHydrating] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const cardPositions = useRef(new Map<string, DOMRect>());
  const revealed = game.reveal !== null && game.selectedCard !== null;

  const revealByName = useMemo<Record<string, Reveal["cards"][number]>>(
    () =>
      Object.fromEntries(
        (game.reveal?.cards ?? []).map((card) => [card.name, card]),
      ),
    [game.reveal],
  );
  const displayedCards = useMemo(() => {
    if (!game.reveal) return game.puzzle.cards;
    return [...game.puzzle.cards].sort(
      (a, b) => revealByName[b.name].arenaShare - revealByName[a.name].arenaShare,
    );
  }, [game.puzzle.cards, game.reveal, revealByName]);

  useEffect(() => {
    const controller = new AbortController();
    startedAt.current = performance.now();
    void (async () => {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (!response.ok || !isGameState(body)) {
          throw new Error(errorMessage(body, "Live voting is temporarily unavailable"));
        }
        setGame(body);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Live voting is temporarily unavailable");
      } finally {
        if (!controller.signal.aborted) setHydrating(false);
      }
    })();
    return () => controller.abort();
  }, [endpoint]);

  useLayoutEffect(() => {
    if (!revealed || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cardPositions.current.clear();
      return;
    }

    displayedCards.forEach((card, rank) => {
      const element = cardRefs.current.get(card.name);
      const previous = cardPositions.current.get(card.name);
      if (!element || !previous) return;

      const current = element.getBoundingClientRect();
      const deltaX = previous.left - current.left;
      const deltaY = previous.top - current.top;
      if (deltaX === 0 && deltaY === 0) return;

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)`, zIndex: 2 },
          { transform: "translate(0, 0)", zIndex: 2 },
        ],
        {
          duration: 560,
          delay: rank * 14,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards",
        },
      );
    });
    cardPositions.current.clear();
  }, [displayedCards, revealed]);

  useEffect(() => {
    if (revealed) resultRef.current?.focus();
  }, [revealed]);

  async function choose(cardName: string, answerTimestamp: number) {
    if (revealed || submitting || hydrating) return;

    cardPositions.current = new Map(
      game.puzzle.cards.flatMap((card) => {
        const element = cardRefs.current.get(card.name);
        return element ? ([[card.name, element.getBoundingClientRect()]] as const) : [];
      }),
    );
    setSubmitting(true);
    setPendingCard(cardName);
    setError(null);

    try {
      const elapsedMs = Math.min(
        86_400_000,
        Math.max(0, Math.round(answerTimestamp - (startedAt.current ?? answerTimestamp))),
      );
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card: cardName, elapsedMs }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !isGameState(body)) {
        throw new Error(errorMessage(body, "Your pick could not be saved"));
      }
      setGame(body);
    } catch (caught) {
      cardPositions.current.clear();
      setError(caught instanceof Error ? caught.message : "Your pick could not be saved");
    } finally {
      setSubmitting(false);
      setPendingCard(null);
    }
  }

  async function shareResult() {
    if (!game.reveal || !game.selectedCard) return;
    const selected = revealByName[game.selectedCard];
    const rank = game.reveal.cards
      .toSorted((a, b) => b.arenaShare - a.arenaShare)
      .findIndex((card) => card.name === game.selectedCard) + 1;
    const streak = game.reveal.favoriteStreak > 0 ? ` · ${game.reveal.favoriteStreak} streak` : "";
    const text = `P1P1 ${game.puzzle.date}\n${game.selectedCard} — #${rank}, ${formatShare(selected.arenaShare)} Arena share${streak}`;
    const url = isToday ? window.location.origin : window.location.href;

    try {
      const webShare = Reflect.get(navigator, "share");
      const usesWebShare = typeof webShare === "function";
      if (usesWebShare) {
        await webShare.call(navigator, { title: "P1P1", text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
      }
      await fetch(`/api/share/${game.puzzle.date}`, { method: "POST" });
      setShareStatus(usesWebShare ? "Shared" : "Copied");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setShareStatus("Could not share");
    }
  }

  const selectedStats = game.selectedCard ? revealByName[game.selectedCard] : undefined;
  const arenaRank =
    selectedStats && game.reveal
      ? game.reveal.cards
          .toSorted((a, b) => b.arenaShare - a.arenaShare)
          .findIndex((card) => card.name === game.selectedCard) + 1
      : 0;
  const formattedDate = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${game.puzzle.date}T00:00:00Z`));

  return (
    <main>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="P1P1 home">
          P1P1<span className="wordmark-dot">.</span>
        </Link>
        <nav className="site-nav" aria-label="Game navigation">
          <Link href="/">Today</Link>
          <Link href="/archive">Archive</Link>
        </nav>
        <div className="header-meta" aria-label="Puzzle details">
          <span>{formattedDate}</span>
          <span className="meta-divider" aria-hidden="true" />
          <span>{game.puzzle.set}</span>
        </div>
      </header>

      <section className="game-shell" id="top" aria-labelledby="game-title">
        <div className="game-intro">
          <div>
            <p className="eyebrow">Pack 1 · Pick 1</p>
            <h1 id="game-title">
              {revealed ? "Here’s how the crowds split." : "What’s your first pick?"}
            </h1>
          </div>
          <p className="instruction">
            {revealed && game.reveal
              ? `Arena’s model beside ${game.reveal.siteTotal.toLocaleString()} site ${game.reveal.siteTotal === 1 ? "pick" : "picks"}.`
              : "One pack. One choice. Trust your draft instincts."}
          </p>
        </div>

        <div className="game-status" aria-live="polite">
          {hydrating ? "Checking for an existing pick…" : null}
          {submitting ? `Locking in ${pendingCard}…` : null}
          {error ? <span className="game-error">{error}</span> : null}
        </div>

        {selectedStats && game.reveal && game.selectedCard ? (
          <div className="result" ref={resultRef} tabIndex={-1} role="status" aria-live="polite">
            <div className="result-pick">
              <span className="result-kicker">Your pick</span>
              <strong>{game.selectedCard}</strong>
            </div>
            <div className="result-score">
              <strong>#{arenaRank} of {game.puzzle.cards.length}</strong>
              <span>{formatShare(selectedStats.arenaShare)} Arena share</span>
              <span>
                {formatShare(selectedStats.siteShare)} of {game.reveal.siteTotal.toLocaleString()} site picks
              </span>
              <span>{formatWinRate(selectedStats.winRate)}</span>
            </div>
            <div className="result-story-wrap">
              <p className="result-story">
                {game.reveal.why} Win rate describes games where a card was in hand, not a verdict on your pick.
              </p>
              <div className="result-actions">
                {game.reveal.favoriteStreak > 0 ? (
                  <span className="streak">{game.reveal.favoriteStreak} favourite streak</span>
                ) : null}
                <button className="share-button" type="button" onClick={shareResult}>
                  {shareStatus ?? "Share result"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div
          className={`card-grid${revealed ? " is-revealed" : ""}`}
          aria-label={revealed ? "Cards ranked by Arena pick share" : "Booster pack"}
        >
          {displayedCards.map((card, index) => {
            const stats = revealByName[card.name];
            const isSelected = game.selectedCard === card.name;
            const isFavorite = game.reveal?.arenaFavorite === card.name;
            const isWinRateBest = game.reveal?.bestWinRate === card.name;
            const isDimmed = revealed && stats.arenaShare < 0.05 && !isSelected;
            const accessibleLabel = revealed
              ? `${card.name}, ${formatShare(stats.arenaShare)} Arena share, ${formatShare(stats.siteShare)} site share, ${formatWinRate(stats.winRate)}${isSelected ? ", your pick" : ""}${isFavorite ? ", Arena model favourite" : ""}${isWinRateBest ? ", best win rate in the pack" : ""}`
              : `Choose ${card.name}`;

            return (
              <button
                className={`card-choice${isSelected ? " is-selected" : ""}${
                  isFavorite && revealed ? " is-favorite" : ""
                }${isDimmed ? " is-dimmed" : ""}${pendingCard === card.name ? " is-pending" : ""}`}
                type="button"
                key={card.name}
                ref={(element) => {
                  if (element) cardRefs.current.set(card.name, element);
                  else cardRefs.current.delete(card.name);
                }}
                onClick={(event) => void choose(card.name, event.timeStamp)}
                disabled={revealed || submitting || hydrating}
                aria-label={accessibleLabel}
              >
                <span className="card-art-wrap">
                  <span className="card-art-fallback" aria-hidden="true">{card.name}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="card-art"
                    src={card.image}
                    alt=""
                    loading={index < 7 ? "eager" : "lazy"}
                    decoding="async"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                  {revealed ? (
                    <span className="card-badges" aria-hidden="true">
                      {isSelected ? <span className="badge badge-pick">Your pick</span> : null}
                      {isFavorite ? <span className="badge badge-favorite">Arena #1</span> : null}
                      {isWinRateBest ? <span className="badge badge-winrate">Best win rate</span> : null}
                    </span>
                  ) : null}
                </span>
                <span className="card-info">
                  <span className="card-name">{card.name}</span>
                  {revealed ? (
                    <>
                      <span className="share" aria-hidden="true">
                        <span className="share-value">Arena {formatShare(stats.arenaShare)}</span>
                        <span className="share-track">
                          <span
                            className="share-fill"
                            style={{ width: `${Math.max(stats.arenaShare * 100, 0.35)}%` }}
                          />
                        </span>
                      </span>
                      <span className="share site-share" aria-hidden="true">
                        <span className="share-value">Site {formatShare(stats.siteShare)}</span>
                        <span className="share-track">
                          <span
                            className="share-fill"
                            style={{ width: `${Math.max(stats.siteShare * 100, 0.35)}%` }}
                          />
                        </span>
                      </span>
                      <span className="win-rate" aria-hidden="true">{formatWinRate(stats.winRate)}</span>
                    </>
                  ) : (
                    <span className="choose-label" aria-hidden="true">Choose card</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {revealed ? (
          <aside className="tomorrow-note">
            <span className="tomorrow-mark" aria-hidden="true">{game.puzzle.date.slice(-2)}</span>
            <div>
              <strong>One decision. That’s the whole game.</strong>
              <p>
                {isToday ? "A new pack arrives at 00:00 UTC." : <Link href="/">Play today’s pack.</Link>}
              </p>
            </div>
          </aside>
        ) : null}
      </section>

      <footer>
        <p>
          Arena shares are fitted from Premier Draft choices published by{" "}
          <a href="https://www.17lands.com/public_datasets">17Lands</a>; site shares are live P1P1 votes shown only after picking. Win rates are 17Lands games-in-hand rates. Card images courtesy of{" "}
          <a href="https://scryfall.com">Scryfall</a>.
        </p>
        <p>
          P1P1 is unofficial Fan Content permitted under the Fan Content Policy. Not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC.{" "}
          <Link href="/privacy">Privacy and player data</Link>.
        </p>
      </footer>
    </main>
  );
}
