import { num, percent, severityText } from '@/lib/format';
import { Panel, Skeleton } from '@/components/ui/primitives';
import type { ProjectTaskCounts } from '@/hooks/useProjectTasks';
import type { Severity } from '@/types/dashboard';
import type { ProjectDetailResponse } from '@/types/project';

function Tile({
  label,
  value,
  note,
  noteSeverity = 'neutral',
}: {
  label: string;
  value: string;
  note?: string;
  noteSeverity?: Severity;
}) {
  return (
    <Panel className="px-4 py-3.5 flex flex-col gap-1.5 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">{label}</span>
      <span className="text-[22px] md:text-[26px] font-semibold leading-none tracking-[-0.028em] text-ink">
        {value}
      </span>
      <span className={`text-[11.5px] font-medium min-h-[14px] ${severityText[noteSeverity]}`}>{note ?? ''}</span>
    </Panel>
  );
}

const pct = (have: number, of: number) => (of > 0 ? percent((have / of) * 100) : '—');

/** Four to five stat tiles. The tasks tile only exists when the viewer can see tasks. */
export function ProjectKpis({
  project,
  progress,
  tasks,
}: {
  project: ProjectDetailResponse['project'];
  progress: ProjectDetailResponse['progress'];
  /** Undefined when the viewer lacks task:view; null while the task list loads. */
  tasks: ProjectTaskCounts | null | undefined;
}) {
  const items = project.lotsByFormat.reduce((sum, l) => sum + l.quantity, 0);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <Tile label="Total items" value={num(items)} note={`${num(progress.selectedItems)} selected`} />
      <Tile label="Lots" value={num(project.lotCount)} />
      <Tile
        label="Digitized"
        value={pct(progress.digitizedItems, progress.selectedItems)}
        note={`${num(progress.digitizedItems)} of ${num(progress.selectedItems)} selected`}
      />
      <Tile
        label="MLS tagged"
        value={pct(progress.taggedItems, progress.totalItems)}
        note={`${num(progress.taggedItems)} of ${num(progress.totalItems)}`}
      />
      {tasks === undefined ? null : tasks === null ? (
        <Panel className="px-4 py-3.5 flex flex-col gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-12" />
        </Panel>
      ) : (
        <Tile
          label="Open tasks"
          value={num(tasks.open)}
          note={tasks.overdue > 0 ? `${num(tasks.overdue)} overdue` : undefined}
          noteSeverity="critical"
        />
      )}
    </div>
  );
}
