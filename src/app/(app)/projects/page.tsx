import { redirect } from 'next/navigation';

/**
 * The project list lives under the register now (/register?tab=projects).
 * Server redirect; the legacy `?new=1` deep link still opens the wizard.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: isNew } = await searchParams;
  redirect(isNew === '1' ? '/projects/new' : '/register?tab=projects');
}
