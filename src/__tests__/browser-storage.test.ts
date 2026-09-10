import { describe, it, expect, beforeEach } from 'bun:test';
import {
  saveWorkingCopy,
  loadWorkingCopy,
  clearWorkingCopy,
  resetMemoryFallback,
} from '../lib/browser-storage';
import { makeEmptyAppFileData } from '../lib/schedule-storage';

describe('browser-storage working copy', () => {
  beforeEach(async () => {
    resetMemoryFallback();
    await clearWorkingCopy();
  });

  it('round-trips a working copy', async () => {
    const data = makeEmptyAppFileData();
    data.formValues.numberOfDoctors = 2;
    await saveWorkingCopy(data, { mode: 'browser', fileName: null });
    const loaded = await loadWorkingCopy();
    expect(loaded?.meta.mode).toBe('browser');
    expect(loaded?.data.formValues.numberOfDoctors).toBe(2);
  });

  it('clears the working copy', async () => {
    await saveWorkingCopy(makeEmptyAppFileData(), { mode: 'browser', fileName: null });
    await clearWorkingCopy();
    expect(await loadWorkingCopy()).toBeNull();
  });
});
