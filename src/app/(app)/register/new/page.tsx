import type { Metadata } from 'next';
import { IntakeForm } from '@/components/lots/IntakeForm';

export const metadata: Metadata = {
  title: 'New intake — Archive Tracker',
};

export default function NewIntakePage() {
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col gap-1.5 min-w-0">
        <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">
          New intake
        </h1>
        <p className="m-0 text-[12.5px] text-ink-3">
          Register a lot at the counter. A lot reference is issued on save; the naming code
          comes later, at decision.
        </p>
      </div>
      <IntakeForm />
    </div>
  );
}
