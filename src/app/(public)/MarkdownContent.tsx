"use client";

const RESET_DELAY_MS = 4000;
const CHECK_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

export function MarkdownContent({ html }: { html: string }) {
  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-copy-button]",
    );
    if (!button) return;

    const code = button.closest("[data-code-block]")?.querySelector("code");
    if (!code?.textContent) return;

    navigator.clipboard.writeText(code.textContent).then(() => {
      const originalHTML = button.innerHTML;
      const originalLabel = button.getAttribute("aria-label");
      button.innerHTML = CHECK_ICON;
      button.setAttribute("aria-label", "Copied");
      setTimeout(() => {
        button.innerHTML = originalHTML;
        if (originalLabel) button.setAttribute("aria-label", originalLabel);
      }, RESET_DELAY_MS);
    });
  }

  return (
    <div
      className="markdown-content"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
