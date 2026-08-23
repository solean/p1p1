import Link from "next/link";
import { DeletePlayerData } from "@/app/privacy/delete-player-data";

export default function PrivacyPage() {
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
        <div className="header-meta">Privacy</div>
      </header>

      <article className="policy-shell">
        <p className="eyebrow">Privacy and player data</p>
        <h1>A small game with a small data footprint.</h1>
        <p className="policy-lede">
          P1P1 does not require an account. The game stores only what it needs to
          enforce one pick per day, restore your reveal, and measure whether the
          daily game works.
        </p>

        <div className="policy-copy">
          <section>
            <h2>What P1P1 stores</h2>
            <ul>
              <li>A random anonymous player ID in a signed, HttpOnly browser cookie.</li>
              <li>Your chosen card, puzzle date, answer time, and submission time.</li>
              <li>Whether you used the share button.</li>
            </ul>
            <p>
              The app does not ask for or store your name, email address, account,
              password, or browser fingerprint.
            </p>
          </section>

          <section>
            <h2>How it is used</h2>
            <p>
              Picks produce the live site split shown after voting and restore your
              reveal and favourite streak on return visits. Aggregated answer time,
              return, agreement, and share data measure puzzle quality and retention.
              Site votes never change the Arena-model answer key or anyone’s score.
            </p>
          </section>

          <section>
            <h2>Retention and deletion</h2>
            <p>
              The anonymous cookie lasts up to 400 days. Vote history remains until
              it is deleted. Deleting below removes every vote associated with this
              browser identity, recalculates the anonymous site tallies, and clears
              the cookie. Aggregate tallies contain no player identifier.
            </p>
            <DeletePlayerData />
          </section>

          <section>
            <h2>Sources and hosting</h2>
            <p>
              Cloudflare hosts the app and database and may process ordinary request
              metadata as part of operating that infrastructure. Card and draft data
              comes from Scryfall and 17Lands; P1P1 does not send them your player ID
              or vote.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
