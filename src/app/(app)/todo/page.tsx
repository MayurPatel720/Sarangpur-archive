import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TodoManager } from '@/components/tasks/TodoManager';

export const metadata: Metadata = {
  title: 'My to-do — Archive Tracker',
};

export default function TodoPage() {
  return (
    <Suspense fallback={null}>
      <TodoManager />
    </Suspense>
  );
}
