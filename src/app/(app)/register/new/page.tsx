import type { Metadata } from 'next';
import { FORMATS } from '@/lib/domain';
import { IntakeForm } from '@/components/lots/IntakeForm';

export const metadata: Metadata = {
  title: 'New intake — Archive Tracker',
};

/**
 * `?format=` comes from the format block (PageHeading's New Intake, sidebar New
 * Intake). Inside a block the whole intake is locked to that format — every
 * line, dropdown disabled. Without `?format=` (Master List button, direct URL)
 * the format select stays editable, because mixed-format lots are legal.
 */
export default async function NewIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const { format } = await searchParams;
  const initialFormat =
    format && (FORMATS as readonly string[]).includes(format) ? format : undefined;
  return <IntakeForm initialFormat={initialFormat} />;
}
