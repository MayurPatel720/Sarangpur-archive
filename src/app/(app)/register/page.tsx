import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FORMATS } from '@/lib/domain';
import { RegisterManager } from '@/components/lots/RegisterManager';

export const metadata: Metadata = {
  title: 'Lot register — Archive Tracker',
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; format?: string; dataType?: string }>;
}) {
  const { stage, format, dataType } = await searchParams;
  // Only a real format name locks the list; bogus values fall back to global.
  const initialFormat =
    format && (FORMATS as readonly string[]).includes(format) ? format : undefined;
  return (
    <Suspense fallback={null}>
      <RegisterManager
        initialStage={stage}
        initialFormat={initialFormat}
        initialDataType={dataType}
      />
    </Suspense>
  );
}
