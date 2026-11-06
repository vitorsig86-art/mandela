import type { IconName } from "./icons";

// Same width as the CSS that swaps the side panel for the bottom bar.
export const MOBILE_MEDIA_QUERY = "(max-width: 760px)";

export function isMobileLayout(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

// Mobile bottom bar. "Camadas" (always first) opens the layer sheet; these tabs
// choose the one overlay shown over the map.
export type MobileView = "time" | "measure" | "legend";

export const MOBILE_TABS: { id: MobileView; label: string; icon: IconName }[] = [
  { id: "time", label: "Tempo", icon: "history" },
  { id: "measure", label: "Medir", icon: "ruler" },
  { id: "legend", label: "Legenda", icon: "legend" },
];

// Tabs exist only for what the project has: "Tempo" needs campaigns, "Legenda" a legend.
export function shownMobileTabs(hasCampaigns: boolean, legendCount: number) {
  return MOBILE_TABS.filter(tab => (tab.id !== "time" || hasCampaigns) && (tab.id !== "legend" || legendCount > 0));
}

// Start: "Tempo" with campaigns; otherwise "Camadas", i.e. the sheet open and no overlay.
// With a popup.openOnHome layer and no campaigns, the map starts clear (sheet
// closed, no overlay) so that popup is visible: the open sheet would hide it.
export function initialMobileState(hasCampaigns: boolean, homePopup = false): { panelOpen: boolean; view: MobileView | null } {
  return hasCampaigns ? { panelOpen: false, view: "time" } : { panelOpen: !homePopup, view: null };
}

// A tab that disappears (e.g. the last legend turned off) falls back to the start view.
export function activeMobileView(view: MobileView | null, hasCampaigns: boolean, legendCount: number): MobileView | null {
  return view && shownMobileTabs(hasCampaigns, legendCount).some(tab => tab.id === view) ? view : initialMobileState(hasCampaigns).view;
}
