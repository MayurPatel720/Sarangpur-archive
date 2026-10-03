'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { date } from '@/lib/format';
import type { ProjectListResponse } from '@/types/project';
import { ErrorState, Panel, PanelHeader } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, TextInput } from '@/components/ui/Form';
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
  {
    key: 'target',
    header: 'Target',
    render: (r) => <span className="whitespace-nowrap">{r.targetDate ? date(r.targetDate) : '—'}</span>,
  },
];

export function ProjectsManager() {
  const router = useRouter();
  const { page, pageSize, setPage, setPageSize, resetPage } = useUrlPagination(25);
  const [search, setSearch] = useState('');
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

  const key = useMemo(() => JSON.stringify({ page, pageSize, search: debounced }), [page, pageSize, debounced]);
  const query = useQuery({
    queryKey: queryKeys.projects.list(key),
    queryFn: () => projectsApi.list(page, pageSize, debounced || undefined),
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
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">
            Projects
          </h1>
          <p className="m-0 text-[12.5px] text-ink-3">
            {query.data ? `${query.data.total} projects on record.` : 'Group lots into projects.'}
          </p>
        </div>
        {canCreate ? (
          <div className="sm:ml-auto">
            <button
              type="button"
              onClick={() => router.push('/projects/new')}
              className="inline-flex items-center justify-center h-10 px-4 bg-accent border border-accent rounded-[6px] shadow-accent text-white text-[13px] font-semibold cursor-pointer"
            >
              New project
            </button>
          </div>
        ) : null}
      </div>

      <div className="bg-surface border border-line rounded-[8px] p-3 md:p-4">
        <div className="max-w-[420px]">
          <Field label="Search">
            <TextInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              placeholder="Code or name…"
              aria-label="Search projects"
            />
          </Field>
        </div>
      </div>

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
              emptyMessage="No projects yet."
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
