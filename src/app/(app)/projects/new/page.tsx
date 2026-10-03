import type { Metadata } from 'next';
import { ProjectWizard } from '@/components/projects/ProjectWizard';

export const metadata: Metadata = {
  title: 'New project — Archive Tracker',
};

export default function NewProjectPage() {
  return <ProjectWizard />;
}
