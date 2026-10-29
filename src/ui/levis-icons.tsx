/** Levis' own icons and helpers, beside upstream's ui/icons.tsx. */

type IconProps = { className?: string };

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"]);

/** A picture file, by its extension. */
export function isImageName(name: string): boolean {
  return IMAGE_EXTS.has(name.split(".").pop()?.toLowerCase() ?? "");
}

export function SparkleIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M7 2.5C7.35 5.1 8.4 6.15 11 6.5C8.4 6.85 7.35 7.9 7 10.5C6.65 7.9 5.6 6.85 3 6.5C5.6 6.15 6.65 5.1 7 2.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M11.75 10C11.9 11.1 12.4 11.6 13.5 11.75C12.4 11.9 11.9 12.4 11.75 13.5C11.6 12.4 11.1 11.9 10 11.75C11.1 11.6 11.6 11.1 11.75 10Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
