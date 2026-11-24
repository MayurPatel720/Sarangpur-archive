import { Panel, PanelHeader } from '@/components/ui/primitives';

/** People involved in this project, entered when creating it and editable from its Edit dialog. */
export function ProjectPeopleCard({ people }: { people: { name: string; phone: string }[] }) {
  return (
    <Panel>
      <PanelHeader title={`People involved${people.length > 0 ? ` (${people.length})` : ''}`} />
      <div className="px-4 md:px-5 py-4 flex flex-col gap-1.5">
        {people.length > 0 ? (
          people.map((p, i) => (
            <span key={`${p.name}-${i}`} className="text-[13px] text-ink-2 break-words">
              {p.name} ·{' '}
              <a href={`tel:${p.phone.replace(/\s+/g, '')}`} className="text-ink-2 no-underline hover:underline">
                {p.phone}
              </a>
            </span>
          ))
        ) : (
          <span className="text-[12.5px] text-ink-3">No people added yet. Use Edit on this project to add them.</span>
        )}
      </div>
    </Panel>
  );
}
