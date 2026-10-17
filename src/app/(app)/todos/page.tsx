import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TodoManager } from '@/components/todos/TodoManager';

export const metadata: Metadata = { title: 'My to-do — Archive Tracker' };

export default function TodosPage() {
  return (
    <Suspense fallback={null}>
      <TodoManager />
    </Suspense>
  );
}
