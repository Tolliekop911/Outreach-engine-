// Pure campaign-sequencing logic (no I/O), so it is easy to reason about and
// test. An enrollment's `current_step` is the 0-based index of the NEXT step to
// run. A step's `delay_minutes` is the wait BEFORE that step.

// Steps sorted by their declared order.
export function orderSteps(steps) {
  return [...steps].sort((a, b) => a.step_order - b.step_order);
}

// The step an enrollment should run now, or null if the sequence is finished.
export function stepToRun(currentStep, steps) {
  const ordered = orderSteps(steps);
  return ordered[currentStep] || null;
}

// When should the FIRST step fire for a freshly enrolled lead?
export function firstActionAt(steps, fromTime = Date.now()) {
  const ordered = orderSteps(steps);
  const delay = ordered.length ? (ordered[0].delay_minutes || 0) : 0;
  return new Date(fromTime + delay * 60000);
}

// After running the step at `current_step`, compute the enrollment's next state.
// Returns { status, current_step, next_action_at } where next_action_at is a
// Date (or null when completed).
export function planAdvance(currentStep, steps, fromTime = Date.now()) {
  const ordered = orderSteps(steps);
  const nextIndex = currentStep + 1;
  if (nextIndex >= ordered.length) {
    return { status: 'completed', current_step: nextIndex, next_action_at: null };
  }
  const delay = ordered[nextIndex].delay_minutes || 0;
  return {
    status: 'active',
    current_step: nextIndex,
    next_action_at: new Date(fromTime + delay * 60000),
  };
}
