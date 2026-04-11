export function joinText(base: string, next: string) {
  if (!base) return next.trim();
  const trimmedNext = next.trim();
  if (!trimmedNext) return base;

  if (/[([{"'\u201C]$/.test(base) || /^[,.;:!?)}\]'\u201D\u201C]/.test(trimmedNext)) {
    return `${base}${trimmedNext}`;
  }

  return `${base} ${trimmedNext}`;
}
