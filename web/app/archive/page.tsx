import Link from "next/link";
import { scheduledArchive } from "@/lib/schedule";

export default function ArchivePage() {
  const days = scheduledArchive();

  return (
    <main>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="P1P1 home">
          P1P1<span className="wordmark-dot">.</span>
        </Link>
        <nav className="site-nav" aria-label="Game navigation">
          <Link href="/">Today</Link>
          <Link href="/archive" aria-current="page">Archive</Link>
        </nav>
        <div className="header-meta">Past packs</div>
      </header>

      <section className="archive-shell" aria-labelledby="archive-title">
        <p className="eyebrow">Archive</p>
        <h1 id="archive-title">Every decision, one pack at a time.</h1>
        {days.length === 0 ? (
          <p className="archive-empty">The first puzzle is live today. Past packs will appear here after UTC midnight.</p>
        ) : (
          <ol className="archive-grid">
            {days.map((day) => {
              const label = new Intl.DateTimeFormat("en", {
                month: "long",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${day.date}T00:00:00Z`));
              return (
                <li key={day.date}>
                  <Link href={`/${day.date}`}>
                    <span className="archive-set">{day.set}</span>
                    <time dateTime={day.date}>{label}</time>
                    <span>{day.cards.length} cards</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
