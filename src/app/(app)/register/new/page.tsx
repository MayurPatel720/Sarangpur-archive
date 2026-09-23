import type { Metadata } from 'next';
import { IntakeForm } from '@/components/lots/IntakeForm';

export const metadata: Metadata = {
  title: 'New intake — Archive Tracker',
};

export default function NewIntakePage() {
  return <IntakeForm />;
}
