/** Levis: each tab's reported markdown, for the Levis layer's listeners
 *  (auto title, the Agent's live preview). MilkdownEditor wraps its
 *  onChange with `reportingChanges`. */
type Listener = (markdown: string) => void;
const listeners = new Map<string, Set<Listener>>();

export function reportingChanges(
  tabId: string,
  onChange: (markdown: string) => void,
): (markdown: string) => void {
  return (markdown) => {
    onChange(markdown);
    for (const listener of listeners.get(tabId) ?? []) listener(markdown);
  };
}

export function onDocChange(tabId: string, listener: Listener): () => void {
  const set = listeners.get(tabId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(tabId, set);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(tabId);
  };
}
