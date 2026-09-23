import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegisterManager } from '@/components/lots/RegisterManager';

export const metadata: Metadata = {
  title: 'Lot register — Archive Tracker',
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; format?: string }>;
}) {
  const { stage, format } = await searchParams;
  return (
    <Suspense fallback={null}>
      <RegisterManager initialStage={stage} initialFormat={format} />
    </Suspense>
  );
}
