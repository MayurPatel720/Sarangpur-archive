import type { Metadata } from 'next';
import { ProjectSharedEditor } from '@/components/projects/ProjectSharedEditor';

export const metadata: Metadata = {
  title: 'Shared details — Archive Tracker',
};

export default async function ProjectSharedPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectSharedEditor projectId={projectId} />;
}
