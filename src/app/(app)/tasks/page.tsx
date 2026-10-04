import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TasksManager } from '@/components/tasks/TasksManager';

export const metadata: Metadata = {
  title: 'Tasks — Archive Tracker',
};

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksManager />
    </Suspense>
  );
}
