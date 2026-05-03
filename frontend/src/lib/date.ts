export function isoFromDateInput(value: string): string | null {
  if (!value) return null;
  return new Date(value + "T00:00:00.000Z").toISOString();
}

export function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

export function isOverdue(dueIso: string, status: string): boolean {
  if (status === "Done") return false;
  const due = Date.parse(dueIso);
  return Number.isFinite(due) && due < Date.now();
}
