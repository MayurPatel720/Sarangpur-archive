import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FORMATS } from '@/lib/domain';
import { RegisterTabs } from '@/components/lots/RegisterTabs';

export const metadata: Metadata = {
  title: 'Lot register — Archive Tracker',
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; format?: string; dataType?: string; assignee?: string }>;
}) {
  const { stage, format, dataType, assignee } = await searchParams;
  // Only a real format name locks the list; bogus values fall back to global.
  const initialFormat =
    format && (FORMATS as readonly string[]).includes(format) ? format : undefined;
  return (
    <Suspense fallback={null}>
      {/* The manager copies these into its own filter state once; a new key remounts it so a changed format (or stage, data type,
          assignee) in the URL loads that scope's lots instead of keeping the previous one's. */}
      <RegisterTabs
        key={`${initialFormat ?? ''}|${stage ?? ''}|${dataType ?? ''}|${assignee ?? ''}`}
        initialStage={stage}
        initialFormat={initialFormat}
        initialDataType={dataType}
        initialAssignee={assignee === 'me' ? 'me' : undefined}
      />
    </Suspense>
  );
}
