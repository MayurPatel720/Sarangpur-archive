import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProjectDetail } from '@/components/projects/ProjectDetail';

export const metadata: Metadata = {
  title: 'Project — Archive Tracker',
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <Suspense fallback={null}>
      <ProjectDetail projectId={projectId} />
    </Suspense>
  );
}
