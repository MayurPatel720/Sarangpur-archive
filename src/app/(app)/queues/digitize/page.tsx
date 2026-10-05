import { redirect } from 'next/navigation';

/** Retired queue — old links land on the Master List filtered to the same stage. */
export default async function LegacyDigitizeQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const { format } = await searchParams;
  redirect(`/register?stage=scanning${format ? `&format=${encodeURIComponent(format)}` : ''}`);
}
