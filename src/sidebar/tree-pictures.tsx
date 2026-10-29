import { useState, useSyncExternalStore, type ComponentType } from "react";
import type { DirEntryInfo } from "../platform/fs-types";
import { fileSrc } from "../platform/file-src";
import { isImageName } from "../ui/levis-icons";
import { ImageViewer } from "./ImageViewer";

/**
 * Pictures in the files sidebar: a picture's row shows it as a thumbnail,
 * and a click opens it on its own (ImageViewer) rather than as a document,
 * with the other pictures of its folder a key away.
 */

interface Shown {
  paths: string[];
  start: number;
}

let shown: Shown | null = null;
const listeners = new Set<() => void>();

function setShown(next: Shown | null) {
  shown = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether a tree row's file opens in the picture viewer. */
export function isTreePicture(entry: DirEntryInfo): boolean {
  return !entry.is_dir && isImageName(entry.name);
}

/** Opens `path` in the viewer, among the pictures of `siblings`. */
export function showTreePicture(siblings: DirEntryInfo[], path: string) {
  const paths = siblings.filter(isTreePicture).map((entry) => entry.path);
  setShown({ paths, start: Math.max(0, paths.indexOf(path)) });
}

/** The viewer while a picture is open; rendered once, by the tree. */
export function TreePictureViewer({ docPath }: { docPath: string | null }) {
  const current = useSyncExternalStore(subscribe, () => shown);
  if (!current) return null;
  return (
    <ImageViewer
      paths={current.paths}
      start={current.start}
      docPath={docPath}
      onClose={() => setShown(null)}
    />
  );
}

/** A row's icon: the picture itself for a picture, else `Icon`. */
export function TreeFileIcon({
  entry,
  Icon,
}: {
  entry: DirEntryInfo;
  Icon: ComponentType<{ className?: string }>;
}) {
  const [failed, setFailed] = useState(false);
  if (!isTreePicture(entry) || failed) return <Icon className="tree-icon" />;
  return (
    <img
      className="tree-thumb"
      src={fileSrc(entry.path)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
