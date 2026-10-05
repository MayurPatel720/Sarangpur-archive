import { redirect } from 'next/navigation';

/** Retired queue — old links land on the Master List filtered to the same stage. */
export default async function LegacyMlsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const { format } = await searchParams;
  redirect(`/register?stage=mls_tag${format ? `&format=${encodeURIComponent(format)}` : ''}`);
}
