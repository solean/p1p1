import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DailyGame } from "@/app/daily-game";
import { getScheduledDay, publicPuzzle, utcDate } from "@/lib/schedule";

type DatePageProps = {
  params: Promise<{ date: string }>;
};

export async function generateMetadata({ params }: DatePageProps): Promise<Metadata> {
  const { date } = await params;
  const day = date <= utcDate() ? getScheduledDay(date) : undefined;
  if (!day) return {};

  const title = `P1P1 ${date} — ${day.set}`;
  const description = "Make the first pick, then compare the Arena model with the P1P1 crowd.";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `/api/og/${date}`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/api/og/${date}`],
    },
  };
}

export default async function DatePage({ params }: DatePageProps) {
  const { date } = await params;
  const today = utcDate();
  const scheduled = date <= today ? getScheduledDay(date) : undefined;
  if (!scheduled) notFound();

  return (
    <DailyGame
      endpoint={`/api/puzzles/${date}`}
      initialPuzzle={publicPuzzle(scheduled)}
      isToday={date === today}
    />
  );
}
