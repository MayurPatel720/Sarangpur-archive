import { FORMAT_LABELS, type Format } from '@/lib/domain';
import { date, num } from '@/lib/format';
import { GhostButton } from '@/components/ui/Form';
import type { ProjectDetailResponse } from '@/types/project';

/** Code, name, description, a one-line meta summary, and the admin actions. */
export function ProjectHeader({
  project,
  canEdit,
  onEdit,
  onShared,
  onAddMedia,
}: {
  project: ProjectDetailResponse['project'];
  canEdit: boolean;
  onEdit: () => void;
  onShared: () => void;
  onAddMedia: () => void;
}) {
  const items = project.lotsByFormat.reduce((sum, l) => sum + l.quantity, 0);
  const formats = [...new Set(project.lotsByFormat.map((l) => l.format))].map(
    (f) => FORMAT_LABELS[f as Format] ?? f,
  );
  const meta = [
    `${num(project.lotCount)} ${project.lotCount === 1 ? 'lot' : 'lots'}`,
    `${num(items)} ${items === 1 ? 'item' : 'items'}`,
    formats.length > 0 ? formats.join(', ') : null,
    `Created ${date(project.createdAt)}${project.createdByName ? ` by ${project.createdByName}` : ''}`,
  ].filter(Boolean);

  return (
    <header className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
      <div className="flex flex-col gap-1.5 min-w-0">
        <p className="m-0 font-mono text-[12.5px] font-semibold text-ink-3">{project.code}</p>
        <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">
          {project.name}
        </h1>
        {project.description ? (
          <p className="m-0 text-[12.5px] leading-relaxed text-ink-2">{project.description}</p>
        ) : null}
        <p className="m-0 text-[12px] text-ink-3">{meta.join(' · ')}</p>
      </div>
      {canEdit ? (
        <div className="sm:ml-auto flex flex-wrap gap-2 flex-shrink-0">
          <GhostButton onClick={onEdit}>Edit</GhostButton>
          <GhostButton onClick={onShared}>Shared details</GhostButton>
          <GhostButton onClick={onAddMedia}>Add media</GhostButton>
        </div>
      ) : null}
    </header>
  );
}
