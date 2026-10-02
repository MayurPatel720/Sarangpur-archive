import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProjectsManager } from '@/components/projects/ProjectsManager';

export const metadata: Metadata = {
  title: 'Projects — Archive Tracker',
};

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsManager />
    </Suspense>
  );
}
