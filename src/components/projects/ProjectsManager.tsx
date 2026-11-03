'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import type { ProjectListResponse } from '@/types/project';
import { ErrorState, Panel, PanelHeader } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ProjectFilters, type ProjectFilterValues } from './ProjectFilters';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { useUrlPagination } from '@/lib/useUrlPagination';

type ProjectRow = ProjectListResponse['rows'][number];

const columns: Column<ProjectRow>[] = [
  {
    key: 'code',
    header: 'Code',
    render: (r) => <span className="font-mono font-semibold text-ink whitespace-nowrap">{r.code}</span>,
  },
  {
    key: 'name',
    header: 'Project',
    render: (r) => (
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="font-semibold text-ink truncate">{r.name}</span>
        {r.description ? (
          <span className="text-[11.5px] text-ink-3 truncate">{r.description}</span>
        ) : null}
      </span>
    ),
  },
  {
    key: 'lots',
    header: 'Lots',
    render: (r) => <span className="whitespace-nowrap">{r.lotCount}</span>,
  },
  {
    key: 'coordinator',
    header: 'Coordinator',
    render: (r) => (
      <span className="whitespace-nowrap">{r.coordinatorName ? r.coordinatorName : '—'}</span>
    ),
  },
];

export function ProjectsManager({ assigneeId }: { /** "My lots": only projects this user has a lot in. */ assigneeId?: string } = {}) {
  const router = useRouter();
  const { page, pageSize, setPage, setPageSize, resetPage } = useUrlPagination(25);
  const [search, setSearch] = useState('');
  // Filters beside the search: coordinator, format and stage of its lots, created dates, and the advanced rows.
  const [pf, setPf] = useState<ProjectFilterValues>({ coordinator: '', format: '', stage: '', createdFrom: '', createdTo: '', adv: '' });
  const filtersOn = Object.values(pf).some(Boolean);
  const extra = useMemo(() => Object.fromEntries(Object.entries(pf).filter(([, v]) => v)) as Record<string, string>, [pf]);
  const me = useMe();
  const canView = me.data ? me.data.grants.includes('project:view') : false;
  const canCreate = me.data ? me.data.grants.includes('project:create') : false;
  // Legacy sidebar deep-link /projects?new=1 → the wizard page.
  useEffect(() => {
    if (me.data && canCreate && new URLSearchParams(window.location.search).get('new') === '1') {
      router.replace('/projects/new');
    }
  }, [me.data, canCreate, router]);

  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const key = useMemo(() => JSON.stringify({ page, pageSize, search: debounced, assignee: assigneeId ?? null, extra }), [page, pageSize, debounced, assigneeId, extra]);
  const query = useQuery({
    queryKey: queryKeys.projects.list(key),
    queryFn: () => projectsApi.list(page, pageSize, debounced || undefined, assigneeId, extra),
    enabled: !!me.data && canView,
  });

  if (me.isLoading) {
    return (
      <Panel>
        <PanelHeader title="Projects" />
        <div className="p-3 md:p-4">
          <DataTable<ProjectRow>
            columns={columns}
            rows={[]}
            loading
            emptyMessage=""
            getRowKey={(r) => r.id}
          />
        </div>
      </Panel>
    );
  }

  if (!canView) {
    return (
      <Panel>
        <ErrorState
          message="You don't have access to projects."
          hint="Ask an admin for the project:view permission."
        />
      </Panel>
    );
  }

  const totalPages = query.data ? totalPagesOf(query.data.total, query.data.pageSize) : 1;

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <ProjectFilters
        search={search}
        onSearch={(v) => {
          setSearch(v);
          resetPage();
        }}
        filters={pf}
        onFilters={(next) => {
          setPf(next);
          resetPage();
        }}
      />

      <Panel>
        <PanelHeader title="Projects" />
        <div className="p-3 md:p-4 pb-0">
          {query.isError ? (
            <ErrorState
              message="Couldn't load projects."
              hint="Check your connection and try again."
              onRetry={() => query.refetch()}
            />
          ) : (
            <DataTable<ProjectRow>
              columns={columns}
              rows={query.data?.rows ?? []}
              loading={query.isLoading}
              emptyMessage={filtersOn || debounced ? 'No projects match these filters.' : 'No projects yet.'}
              getRowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/projects/${r.id}`)}
            />
          )}
        </div>
        {query.data && query.data.total > 0 ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={query.data.total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            label="projects"
          />
        ) : null}
      </Panel>
    </div>
  );
}
