import type { Metadata } from 'next';
import { RegisterManager } from '@/components/lots/RegisterManager';

export const metadata: Metadata = {
  title: 'Lot register — Archive Tracker',
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  return <RegisterManager initialStage={stage} />;
}
