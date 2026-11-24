import { num } from '@/lib/format';
import { Meter, Panel, PanelHeader } from '@/components/ui/primitives';
import type { ProjectDetailResponse } from '@/types/project';

/** Compact progress: three thin meters across all items. */
export function ProjectProgressCard({ progress }: { progress: ProjectDetailResponse['progress'] }) {
  const meters = [
    { label: 'Items selected', have: progress.selectedItems, of: progress.totalItems },
    { label: 'Items digitized', have: progress.digitizedItems, of: progress.selectedItems },
    { label: 'Items MLS-tagged', have: progress.taggedItems, of: progress.totalItems },
  ];
  return (
    <Panel>
      <PanelHeader title="Progress" />
      <div className="p-4 flex flex-col gap-3.5">
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
