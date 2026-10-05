import { num } from '@/lib/format';
import { Badge, Meter, Panel, PanelHeader } from '@/components/ui/primitives';
import type { ProjectDetailResponse } from '@/types/project';
import { STAGE_SEVERITY } from './stage-severity';

/** Compact progress: stage counts across all lots, then three thin meters. */
export function ProjectProgressCard({
  progress,
  stageLabel,
}: {
  progress: ProjectDetailResponse['progress'];
  stageLabel: (stage: string) => string;
}) {
  const meters = [
    { label: 'Items selected', have: progress.selectedItems, of: progress.totalItems },
    { label: 'Items digitized', have: progress.digitizedItems, of: progress.selectedItems },
    { label: 'Items MLS-tagged', have: progress.taggedItems, of: progress.totalItems },
  ];
  return (
    <Panel>
      <PanelHeader title="Progress by stage" />
      <div className="p-4 flex flex-col gap-3.5">
        <div className="flex flex-wrap gap-1.5">
          {progress.lotsByStage.length > 0 ? (
            progress.lotsByStage.map((s) => (
              <Badge key={s.stage} severity={STAGE_SEVERITY[s.stage] ?? 'neutral'}>
                {stageLabel(s.stage)} · {num(s.count)}
              </Badge>
            ))
          ) : (
            <span className="text-[12.5px] text-ink-3">No lots in this project yet.</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {meters.map((m) => (
            <div key={m.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-medium text-ink-2">{m.label}</span>
                <span className="text-[12px] font-semibold text-ink">
                  {num(m.have)} / {num(m.of)}
                </span>
              </div>
              <Meter percent={m.of > 0 ? Math.round((m.have / m.of) * 100) : 0} severity="info" />
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
