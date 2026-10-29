/** Levis: sanitized reply HTML with each image's `src` mapped to where it
 *  really points (a document's pictures by their paths), the original kept
 *  as data-doc-src. Used by MarkdownText's `imageSrc`. */
export function withImageSrc(
  html: string,
  imageSrc?: (src: string) => string,
): string {
  if (!imageSrc || !html.includes("<img")) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const img of template.content.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (!src || img.hasAttribute("data-draft-picture")) continue;
    img.setAttribute("data-doc-src", src);
    img.setAttribute("src", imageSrc(src));
  }
  return template.innerHTML;
}
