'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TabPanel, Tabs } from '@/components/ui/primitives';
import type { LotDetailResponse } from '@/types/lot';
import { DecisionSection } from './DecisionSection';
import { ScanSection } from './ScanSection';
import { MlsSection } from './MlsSection';
import { ReturnSection } from './ReturnSection';
import { DiscardSection } from './DiscardSection';
import { FilePathSection } from './FilePathSection';

type DetailLot = LotDetailResponse['lot'];

/** Sub-steps of the workflow tab; deep-linked via `?tab=workflow&step=…`. */
export const WORKFLOW_STEPS = ['decision', 'scan', 'tag', 'return', 'discard', 'storage'] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

const STEP_LABELS: Record<WorkflowStep, string> = {
  decision: 'Decision',
  scan: 'Scan',
  tag: 'Tag',
  return: 'Return',
  discard: 'Discard',
  storage: 'Storage',
};

/** Panel anchor ids kept from the old stacked layout so `#wf-…` links don't break. */
const STEP_ANCHORS: Record<WorkflowStep, string> = {
  decision: 'wf-decision',
  scan: 'wf-scan',
  tag: 'wf-tag',
  return: 'wf-return',
  discard: 'wf-discard',
  storage: 'wf-storage',
};

function parseStep(raw: string | null): WorkflowStep {
  return (WORKFLOW_STEPS as readonly string[]).includes(raw ?? '') ? (raw as WorkflowStep) : 'decision';
}

/**
 * One workflow step visible at a time (nested tabs inside the Workflow tab).
 * Section components render unchanged — this only changes navigation. The
 * Storage location panel stays at the foot, below the active step.
 */
export function WorkflowSteps({ lot, onChanged }: { lot: DetailLot; onChanged: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const step = parseStep(searchParams.get('step'));

  const setStep = (next: WorkflowStep) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'decision') params.delete('step');
    else params.set('step', next);
    params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const tabs = useMemo(() => WORKFLOW_STEPS.map((id) => ({ id, label: STEP_LABELS[id] })), []);

  return (
    <div className="flex flex-col gap-3.5 md:gap-4">
      <Tabs tabs={tabs} value={step} onChange={(id) => setStep(id as WorkflowStep)} ariaLabel="Workflow steps" />

      <TabPanel id="decision" active={step === 'decision'}>
        <div id={STEP_ANCHORS.decision} className="scroll-mt-16">
          <DecisionSection lot={lot} onChanged={onChanged} />
        </div>
      </TabPanel>

      <TabPanel id="scan" active={step === 'scan'}>
        <div id={STEP_ANCHORS.scan} className="scroll-mt-16">
          <ScanSection lot={lot} onChanged={onChanged} />
        </div>
      </TabPanel>

      <TabPanel id="tag" active={step === 'tag'}>
        <div id={STEP_ANCHORS.tag} className="scroll-mt-16">
          <MlsSection lot={lot} onChanged={onChanged} />
        </div>
      </TabPanel>

      <TabPanel id="return" active={step === 'return'}>
        <div id={STEP_ANCHORS.return} className="scroll-mt-16">
          <ReturnSection lot={lot} onChanged={onChanged} />
        </div>
      </TabPanel>

      <TabPanel id="discard" active={step === 'discard'}>
        <div id={STEP_ANCHORS.discard} className="scroll-mt-16">
          <DiscardSection lot={lot} onChanged={onChanged} />
        </div>
      </TabPanel>

      <TabPanel id="storage" active={step === 'storage'}>
        <div id={STEP_ANCHORS.storage} className="scroll-mt-16">
          <FilePathSection lot={lot} onChanged={onChanged} />
        </div>
      </TabPanel>
    </div>
  );
}
