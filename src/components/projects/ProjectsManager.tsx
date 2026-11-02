'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { useReferenceList } from '@/hooks/useReferenceList';
import { useUserPicker } from '@/hooks/useUserPicker';
import type { ProjectListResponse } from '@/types/project';
import { ErrorState, Panel, PanelHeader } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, GhostButton, Select, TextInput } from '@/components/ui/Form';
import { DatePicker } from '@/components/ui/DatePicker';
import { AdvancedFilterButton } from '@/components/ui/AdvancedFilters';
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
  const [pf, setPf] = useState({ coordinator: '', format: '', stage: '', createdFrom: '', createdTo: '', adv: '' });
  const setFilter = (k: keyof typeof pf) => (v: string) => {
    setPf((p) => ({ ...p, [k]: v }));
    resetPage();
  };
  const filtersOn = Object.values(pf).some(Boolean);
  const extra = useMemo(() => Object.fromEntries(Object.entries(pf).filter(([, v]) => v)) as Record<string, string>, [pf]);
  const coordinators = useUserPicker();
  const formats = useReferenceList('format');
  const stages = useReferenceList('stage');
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

      <div role="search" aria-label="Filter projects" className="bg-surface border border-line rounded-[8px] p-3 md:p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2">
            <Field label="Search">
              <TextInput
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPage();
                }}
                name="q"
                autoComplete="off"
                placeholder="Code or name…"
                aria-label="Search projects"
              />
            </Field>
          </div>
          <Field label="Coordinator">
            <Select value={pf.coordinator} onChange={(e) => setFilter('coordinator')(e.target.value)} aria-label="Coordinator">
              <option value="">Anyone</option>
              {(coordinators.data?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Has a lot of format">
            <Select value={pf.format} onChange={(e) => setFilter('format')(e.target.value)} aria-label="Format">
              <option value="">Any format</option>
              {(formats.data?.items ?? []).map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Has a lot at stage">
            <Select value={pf.stage} onChange={(e) => setFilter('stage')(e.target.value)} aria-label="Stage">
              <option value="">Any stage</option>
              {(stages.data?.items ?? []).map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Created from">
            <DatePicker value={pf.createdFrom} onChange={setFilter('createdFrom')} aria-label="Created from" />
          </Field>
          <Field label="Created to">
            <DatePicker value={pf.createdTo} onChange={setFilter('createdTo')} aria-label="Created to" />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <AdvancedFilterButton entity="projects" value={pf.adv} onChange={setFilter('adv')} />
          {filtersOn || search ? (
            <GhostButton
              onClick={() => {
                setPf({ coordinator: '', format: '', stage: '', createdFrom: '', createdTo: '', adv: '' });
                setSearch('');
                resetPage();
              }}
            >
              Clear filters
            </GhostButton>
          ) : null}
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
