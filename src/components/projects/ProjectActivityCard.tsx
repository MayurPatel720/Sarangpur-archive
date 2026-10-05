import { date } from '@/lib/format';
import { Badge, Panel, PanelHeader } from '@/components/ui/primitives';
import type { ProjectDetailResponse } from '@/types/project';

/** The project's recent audit trail (read-only). */
export function ProjectActivityCard({ activity }: { activity: ProjectDetailResponse['recentActivity'] }) {
  return (
    <Panel>
      <PanelHeader title="Recent activity" />
      <div className="p-4">
        {activity.length > 0 ? (
          <ul className="m-0 flex flex-col gap-2.5 p-0 list-none">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5 text-[12.5px]">
                <span className="pt-0.5 flex-shrink-0">
                  <Badge severity={a.severity}>{a.kind.replace(/_/g, ' ')}</Badge>
                </span>
                <span className="min-w-0 flex flex-col gap-0.5">
                  <span className="text-ink font-medium leading-snug">{a.title}</span>
                  <span className="text-ink-3 text-[11.5px]">
                    {a.actorName} · {date(a.at)}
                    {a.lotCode ? ` · ${a.lotCode}` : ''}
                    {a.projectCode ? ` · ${a.projectCode}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[12.5px] text-ink-3">No activity yet.</p>
        )}
        <p className="m-0 mt-3 text-[12px] text-ink-3">Full history lives on each lot&apos;s activity tab.</p>
      </div>
    </Panel>
  );
}
