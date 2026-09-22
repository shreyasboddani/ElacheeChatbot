export interface EmbedPresentation {
  theme: "light" | "dark" | "auto";
  launcherVisible: boolean;
  position: "bottom-left" | "bottom-right";
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseEmbedPresentation(
  params: Record<string, string | string[] | undefined>,
): EmbedPresentation {
  const requestedTheme = first(params.theme);
  const requestedLauncher = first(params.launcher);
  const requestedPosition = first(params.position);
  return {
    theme:
      requestedTheme === "dark" || requestedTheme === "auto"
        ? requestedTheme
        : "light",
    launcherVisible:
      requestedLauncher === "visible" || requestedLauncher === "true",
    position:
      requestedPosition === "bottom-right" ? "bottom-right" : "bottom-left",
  };
}

