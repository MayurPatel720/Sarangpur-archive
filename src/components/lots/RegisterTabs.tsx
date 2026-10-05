'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { lotsApi, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { TabPanel, Tabs } from '@/components/ui/primitives';
import { ProjectsManager } from '@/components/projects/ProjectsManager';
import { RegisterManager } from './RegisterManager';

const TAB_IDS = ['lots', 'projects'] as const;
type RegisterTab = (typeof TAB_IDS)[number];

/** Params that only mean something on the Lots tab (or are per-list paging). */
const LOTS_ONLY_PARAMS = ['stage', 'format', 'dataType', 'page', 'pageSize'] as const;

const COUNT_PARAMS = { page: '1', pageSize: '1' };

/**
 * Register page shell: "Lots" and "Projects" tabs (`?tab=projects`, default
 * Lots). Lots filters live only in the Lots tab — switching tabs clears them
 * from the URL. Counts come from one-row list requests, cached under the same
 * query keys the lists use. Requires a Suspense boundary above.
 */
export function RegisterTabs({
  initialStage,
  initialFormat,
  initialDataType,
  initialAssignee,
}: {
  initialStage?: string;
  initialFormat?: string;
  initialDataType?: string;
  initialAssignee?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const me = useMe();
  const canLots = me.data ? me.data.grants.includes('lot:view') : false;
  const canProjects = me.data ? me.data.grants.includes('project:view') : false;

  const raw = searchParams.get('tab');
  const tab: RegisterTab = raw === 'projects' ? 'projects' : 'lots';

  // "My lots" (?assignee=me): counts and the Projects tab narrow to what this user is assigned to.
  const mineId = searchParams.get('assignee') === 'me' ? me.data?.id : undefined;
  const mine = searchParams.get('assignee') === 'me';

  const lotsParams = mineId ? { ...COUNT_PARAMS, assignee: mineId } : COUNT_PARAMS;
  const lotsCount = useQuery({
    queryKey: queryKeys.lots.list(JSON.stringify(lotsParams)),
    queryFn: () => lotsApi.list(lotsParams),
    enabled: !!me.data && canLots && (!mine || !!mineId),
  });
  const projectsCount = useQuery({
    queryKey: queryKeys.projects.list(JSON.stringify({ page: 1, pageSize: 1, count: true, assignee: mineId ?? null })),
    queryFn: () => projectsApi.list(1, 1, undefined, mineId),
    enabled: !!me.data && canProjects && (!mine || !!mineId),
  });

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const k of LOTS_ONLY_PARAMS) params.delete(k);
      if (next === 'projects') params.set('tab', 'projects');
      else params.delete('tab');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const withCount = (label: string, total: number | undefined) =>
    total === undefined ? label : `${label} (${total})`;
  const tabs = [
    { id: 'lots', label: withCount('Lots', lotsCount.data?.total) },
    // Always listed so the tab is discoverable; ProjectsManager shows the
    // no-access state itself when project:view is missing.
    { id: 'projects', label: withCount('Projects', projectsCount.data?.total) },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Register sections" />
      <TabPanel id="lots" active={tab === 'lots'}>
        <RegisterManager
          initialStage={initialStage}
          initialFormat={initialFormat}
          initialDataType={initialDataType}
          initialAssignee={initialAssignee}
        />
      </TabPanel>
      <TabPanel id="projects" active={tab === 'projects'}>
        <ProjectsManager assigneeId={mineId} />
      </TabPanel>
    </div>
  );
}
