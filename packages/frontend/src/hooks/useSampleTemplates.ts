// ============================================================================
// useSampleTemplates — Phase 7 stub.
//
// The cloud-product "Templates" feature has been removed for the OSS / self-host
// release. This hook used to fetch curated templates from the backend and
// power the sample-project surface that unauthenticated visitors landed on.
//
// In self-host, every install has one team and no curated public marketplace,
// so the entire concept is dead. This stub keeps the existing call sites
// compiling while everything returns inert values. The full consumer cleanup
// (props, UI surfaces, dead branches) is a follow-up sweep tracked separately.
// ============================================================================

import { useRef } from 'react';
import type { SampleTemplate } from '../utils/sample-templates';

export interface UseSampleTemplatesResult {
  sampleTemplates: SampleTemplate[];
  filteredSampleTemplates: SampleTemplate[];
  activeSampleIdx: number;
  sampleModeToast: () => void;
  handleSwitchSampleTemplate: (idx: number) => void;
  isSampleMode: boolean;
  isSampleModeRef: React.MutableRefObject<boolean>;
}

const NOOP = () => {};
const EMPTY: SampleTemplate[] = [];

export function useSampleTemplates(_lastSyncedPathnameRef?: unknown): UseSampleTemplatesResult {
  const isSampleModeRef = useRef(false);
  return {
    sampleTemplates: EMPTY,
    filteredSampleTemplates: EMPTY,
    activeSampleIdx: 0,
    sampleModeToast: NOOP,
    handleSwitchSampleTemplate: NOOP,
    isSampleMode: false,
    isSampleModeRef,
  };
}
