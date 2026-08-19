"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Card = {
  name: string;
  share: number;
  /** 17Lands games-in-hand win rate: games won when this card was in hand. */
  winRate: number;
  image: string;
};

const CARDS: Card[] = [
  {
    name: "Birthday Escape",
    share: 0.01174,
    winRate: 0.5875,
    image:
      "https://cards.scryfall.io/normal/front/4/2/42db2313-b13d-4292-bef2-bf86f989d32f.jpg?1783916321",
  },
  {
    name: "Breaking of the Fellowship",
    share: 0.00017,
    winRate: 0.5742,
    image:
      "https://cards.scryfall.io/normal/front/1/3/130f60d0-4fac-4e4e-a938-58f3b96e5335.jpg?1783916288",
  },
  {
    name: "Dunland Crebain",
    share: 0.04312,
    winRate: 0.6084,
    image:
      "https://cards.scryfall.io/normal/front/6/9/695c05ab-e46e-46c7-bd2e-ef0b2307e449.jpg?1783916311",
  },
  {
    name: "Elven Farsight",
    share: 0.00007,
    winRate: 0.5096,
    image:
      "https://cards.scryfall.io/normal/front/7/3/73d135b2-d2b8-499c-84d9-824370c19ccc.jpg?1783916271",
  },
  {
    name: "Fear, Fire, Foes!",
    share: 0.26437,
    winRate: 0.6315,
    image:
      "https://cards.scryfall.io/normal/front/3/7/37be98a4-0cba-46b4-be93-a9805fe77160.jpg?1783916286",
  },
  {
    name: "Galadhrim Guide",
    share: 0.00007,
    winRate: 0.5132,
    image:
      "https://cards.scryfall.io/normal/front/f/4/f4603f59-f899-4caf-a874-bf234d2045fb.jpg?1783916268",
  },
  {
    name: "Generous Ent",
    share: 0.00037,
    winRate: 0.5533,
    image:
      "https://cards.scryfall.io/normal/front/8/5/85d22d5d-3875-42ff-b51e-c6e21db201f5.jpg?1783916266",
  },
  {
    name: "Nazgûl",
    share: 0.2853,
    winRate: 0.6269,
    image:
      "https://cards.scryfall.io/normal/front/8/3/833936c6-9381-4c0b-a81c-4a938be95040.jpg?1783916298",
  },
  {
    name: "Olog-hai Crusher",
    share: 0.00008,
    winRate: 0.5427,
    image:
      "https://cards.scryfall.io/normal/front/c/3/c33bf593-62e0-491a-a31a-328bce6d8735.jpg?1783916280",
  },
  {
    name: "Orcish Medicine",
    share: 0.00008,
    winRate: 0.5591,
    image:
      "https://cards.scryfall.io/normal/front/6/6/66fae9ab-2302-4dea-a4e8-701938a0ef09.jpg?1783916296",
  },
  {
    name: "Protector of Gondor",
    share: 0.00056,
    winRate: 0.5725,
    image:
      "https://cards.scryfall.io/normal/front/8/5/85708748-40ca-4066-a287-7a6a189ff3df.jpg?1783916327",
  },
  {
    name: "Revive the Shire",
    share: 0.00006,
    winRate: 0.5205,
    image:
      "https://cards.scryfall.io/normal/front/4/6/46b7f493-1b57-4b07-8510-30703282f879.jpg?1783916261",
  },
  {
    name: "There and Back Again",
    share: 0.28879,
    winRate: 0.5935,
    image:
      "https://cards.scryfall.io/normal/front/9/3/939b0bd0-24ea-45de-a2d3-37bbf6a3e6f9.jpg?1783916275",
  },
  {
    name: "Voracious Fell Beast",
    share: 0.10522,
    winRate: 0.6199,
    image:
      "https://cards.scryfall.io/normal/front/d/9/d9b7d7f8-503d-4660-9a18-6a8e2fcaa25f.jpg?1783916295",
  },
];

const ARENA_FAVORITE = "There and Back Again";
const SORTED_CARDS = [...CARDS].sort((a, b) => b.share - a.share);
const WIN_RATE_LEADER = CARDS.reduce((best, card) =>
  card.winRate > best.winRate ? card : best,
);

function formatShare(share: number) {
  const percentage = share * 100;
  return percentage < 0.1 ? "<0.1%" : `${percentage.toFixed(1)}%`;
}

function formatWinRate(winRate: number) {
  return `${(winRate * 100).toFixed(1)}%`;
}

function rankFor(card: Card) {
  return SORTED_CARDS.findIndex(
    (candidate) => candidate.name === card.name,
  ) + 1;
}

export default function Home() {
  const [selected, setSelected] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const cardPositions = useRef(new Map<string, DOMRect>());
  const revealed = selected !== null;
  const selectedCard = CARDS.find((card) => card.name === selected);
  const displayedCards = revealed ? SORTED_CARDS : CARDS;

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
    if (revealed) {
      resultRef.current?.focus();
    }
  }, [revealed]);

  function choose(card: Card) {
    if (!revealed) {
      cardPositions.current = new Map(
        CARDS.flatMap((candidate) => {
          const element = cardRefs.current.get(candidate.name);
          return element
            ? ([[candidate.name, element.getBoundingClientRect()]] as const)
            : [];
        }),
      );
      setSelected(card.name);
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="P1P1 home">
          P1P1<span className="wordmark-dot">.</span>
        </a>
        <div className="header-meta" aria-label="Puzzle details">
          <span>Prototype 001</span>
          <span className="meta-divider" aria-hidden="true" />
          <span>LTR</span>
        </div>
      </header>

      <section className="game-shell" id="top" aria-labelledby="game-title">
        <div className="game-intro">
          <div>
            <p className="eyebrow">Pack 1 · Pick 1</p>
            <h1 id="game-title">
              {revealed ? "Here’s how the table split." : "What’s your first pick?"}
            </h1>
          </div>
          <p className="instruction">
            {revealed
              ? "Modelled from real Arena Premier Draft choices."
              : "Fourteen cards. One choice. Trust your draft instincts."}
          </p>
        </div>

        {selectedCard ? (
          <div
            className="result"
            ref={resultRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
          >
            <div className="result-pick">
              <span className="result-kicker">Your pick</span>
              <strong>{selectedCard.name}</strong>
            </div>
            <div className="result-score">
              <strong>#{rankFor(selectedCard)} of 14</strong>
              <span>{formatShare(selectedCard.share)} modelled share</span>
              <span>{formatWinRate(selectedCard.winRate)} of games won when drawn</span>
            </div>
            <p className="result-story">
              {selectedCard.name === WIN_RATE_LEADER.name
                ? "Your pick also won more games than anything else in this pack — the crowd and the results agree here."
                : `${WIN_RATE_LEADER.name} won the most games of any card here (${formatWinRate(
                    WIN_RATE_LEADER.winRate,
                  )} in hand). Win rate is how a card performed once drawn, not a verdict on your pick.`}
            </p>
          </div>
        ) : null}

        <div
          className={`card-grid${revealed ? " is-revealed" : ""}`}
          aria-label={revealed ? "Cards ranked by modelled pick share" : "Booster pack"}
        >
          {displayedCards.map((card) => {
            const isSelected = selected === card.name;
            const isFavorite = card.name === ARENA_FAVORITE;
            const isWinRateBest = card.name === WIN_RATE_LEADER.name;
            const isDimmed = revealed && card.share < 0.05 && !isSelected;
            const accessibleLabel = revealed
              ? `${card.name}, ${formatShare(card.share)} modelled share, ${formatWinRate(
                  card.winRate,
                )} win rate${isSelected ? ", your pick" : ""}${
                  isFavorite ? ", Arena model favourite" : ""
                }${isWinRateBest ? ", best win rate in the pack" : ""}`
              : `Choose ${card.name}`;

            return (
              <button
                className={`card-choice${isSelected ? " is-selected" : ""}${
                  isFavorite && revealed ? " is-favorite" : ""
                }${isDimmed ? " is-dimmed" : ""}`}
                type="button"
                key={card.name}
                ref={(element) => {
                  if (element) cardRefs.current.set(card.name, element);
                  else cardRefs.current.delete(card.name);
                }}
                onClick={() => choose(card)}
                disabled={revealed}
                aria-label={accessibleLabel}
              >
                <span className="card-art-wrap">
                  <span className="card-art-fallback" aria-hidden="true">
                    {card.name}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="card-art"
                    src={card.image}
                    alt=""
                    loading="eager"
                    decoding="async"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                  {revealed ? (
                    <span className="card-badges" aria-hidden="true">
                      {isSelected ? <span className="badge badge-pick">Your pick</span> : null}
                      {isFavorite ? (
                        <span className="badge badge-favorite">Arena #1</span>
                      ) : null}
                      {isWinRateBest ? (
                        <span className="badge badge-winrate">Best win rate</span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
                <span className="card-info">
                  <span className="card-name">{card.name}</span>
                  {revealed ? (
                    <>
                      <span className="share" aria-hidden="true">
                        <span className="share-value">{formatShare(card.share)}</span>
                        <span className="share-track">
                          <span
                            className="share-fill"
                            style={{ width: `${Math.max(card.share * 100, 0.35)}%` }}
                          />
                        </span>
                      </span>
                      <span className="win-rate" aria-hidden="true">
                        {formatWinRate(card.winRate)} win rate
                      </span>
                    </>
                  ) : (
                    <span className="choose-label" aria-hidden="true">
                      Choose card
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {revealed ? (
          <aside className="tomorrow-note">
            <span className="tomorrow-mark" aria-hidden="true">02</span>
            <div>
              <strong>One decision. That’s the whole game.</strong>
              <p>A new pack tomorrow. No draft queue required.</p>
            </div>
          </aside>
        ) : null}
      </section>

      <footer>
        <p>
          Pick shares are a fitted model of Arena Premier Draft data from{" "}
          <a href="https://www.17lands.com/public_datasets">17Lands</a>, not site
          votes or a claim about the correct pick. Win rates are 17Lands
          games-in-hand rates over the same drafts: the share of games won when
          the card was in hand. Card images courtesy of{" "}
          <a href="https://scryfall.com">Scryfall</a>.
        </p>
        <p>
          P1P1 is unofficial Fan Content and is not approved or endorsed by
          Wizards of the Coast.
        </p>
      </footer>
    </main>
  );
}
