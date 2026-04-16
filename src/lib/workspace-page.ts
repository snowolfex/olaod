export type DesktopWorkspacePage = "chat" | "admin" | "help";

export const DESKTOP_WORKSPACE_PAGE_COOKIE_NAME = "oload_desktop_workspace_page";
export const DEFAULT_DESKTOP_WORKSPACE_PAGE: DesktopWorkspacePage = "chat";

export function isDesktopWorkspacePage(value: string | null | undefined): value is DesktopWorkspacePage {
  return value === "chat" || value === "admin" || value === "help";
}

export function parseDesktopWorkspacePage(value: string | null | undefined): DesktopWorkspacePage {
  return isDesktopWorkspacePage(value) ? value : DEFAULT_DESKTOP_WORKSPACE_PAGE;
}