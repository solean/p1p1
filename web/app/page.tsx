import { DailyGame } from "@/app/daily-game";
import { getScheduledDay, publicPuzzle, utcDate } from "@/lib/schedule";

export default function Home() {
  const today = utcDate();
  const scheduled = getScheduledDay(today);
  if (!scheduled) {
    return (
      <main className="state-page">
        <p className="eyebrow">Pack 1 · Pick 1</p>
        <h1>Today’s pack is not scheduled.</h1>
        <p>The content schedule needs another curated pack before the next UTC day.</p>
      </main>
    );
  }

  return <DailyGame endpoint="/api/puzzle" initialPuzzle={publicPuzzle(scheduled)} isToday />;
}
