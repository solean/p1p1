import scheduleJson from "../../content/schedule.json";

export type ScheduledCard = {
  name: string;
  image: string;
  scryfall_uri: string | null;
  arena_share: number;
  win_rate: number | null;
};

export type ScheduledDay = {
  date: string;
  pack_id: string;
  set: string;
  matchup: [string, string];
  cards: ScheduledCard[];
  answer: string;
  runner_up: string;
  best_win_rate: string | null;
  why: string;
};

export type PublicPuzzle = {
  date: string;
  packId: string;
  set: string;
  cards: Array<{ name: string; image: string }>;
};

type Schedule = {
  version: number;
  days: ScheduledDay[];
};

const schedule = scheduleJson as unknown as Schedule;
const byDate: Record<string, ScheduledDay> = Object.fromEntries(
  schedule.days.map((day) => [day.date, day]),
);
const byPackId: Record<string, ScheduledDay> = Object.fromEntries(
  schedule.days.map((day) => [day.pack_id, day]),
);

export function publicPuzzle(day: ScheduledDay): PublicPuzzle {
  return {
    date: day.date,
    packId: day.pack_id,
    set: day.set,
    cards: day.cards.map((card, index) => ({
      name: card.name,
      image: `/api/cards/${day.pack_id}/${index}`,
    })),
  };
}

export function utcDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function getScheduledDay(day: string): ScheduledDay | undefined {
  return byDate[day];
}

export function getScheduledPack(packId: string): ScheduledDay | undefined {
  return byPackId[packId];
}

export function scheduledArchive(today = utcDate()): ScheduledDay[] {
  return schedule.days.filter((day) => day.date < today).toReversed();
}

export function previousUtcDate(day: string): string {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
