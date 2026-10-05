import { redirect } from 'next/navigation';

/** Retired queue — old links land on the Master List filtered to the same stage. */
export default async function LegacyDecisionQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const { format } = await searchParams;
  redirect(`/register?stage=decision${format ? `&format=${encodeURIComponent(format)}` : ''}`);
}
