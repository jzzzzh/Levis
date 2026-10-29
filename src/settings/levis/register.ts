import { registerSettingsPage, settingsPage } from "../settings-pages";
import { LevisPage } from "./LevisPage";
import { isIOSApp } from "../../platform/capabilities";
import { PHONE_QUERY } from "../../ui/usePhoneLayout";

/** Levis' page in Settings, after upstream's own - through the registry
 *  plugins use, loaded after startup with the Settings chunk. Desktop
 *  only: the Agent surface and dictation are, and a phone's tabs have room
 *  for four. */
if (!settingsPage("levis"))
  registerSettingsPage({
    id: "levis",
    label: () => "Levis",
    available: () => !isIOSApp && !window.matchMedia(PHONE_QUERY).matches,
    Page: LevisPage,
  });
