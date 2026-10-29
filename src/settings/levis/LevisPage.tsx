import type { SettingsPageProps } from "../pages/types";
import { SettingsGroup } from "../pages/SettingsGroup";
import { SettingRow, ToggleRow } from "../sections/controls";
import { MediaSettings } from "../sections/media";
import type { DefaultHome } from "../../prefs/SettingsContext";
import { Select } from "../../ui/Select";
import { isIOSApp } from "../../platform/capabilities";

/** Settings › Levis: the Agent's home, the Magic Diary, and the media
 *  services for dictation and reading aloud. */
export function LevisPage({ t, settings, setSettings }: SettingsPageProps) {
  const zh = settings.language.startsWith("zh");
  return (
    <>
      <SettingsGroup title="Agent">
        {!isIOSApp && (
          <SettingRow label={t.defaultHomeLabel}>
            <Select
              className="settings-select"
              aria-label={t.defaultHomeLabel}
              value={settings.defaultHome}
              onChange={(e) =>
                setSettings({ defaultHome: e.target.value as DefaultHome })
              }
            >
              <option value="agent">{t.defaultHomeAgent}</option>
              <option value="write">{t.defaultHomeWrite}</option>
            </Select>
          </SettingRow>
        )}
        <ToggleRow
          label={t.aiSuggestionsLabel}
          hint={t.aiSuggestionsHint}
          checked={settings.enableAiSuggestions}
          onChange={(v) => setSettings({ enableAiSuggestions: v })}
        />
        <ToggleRow
          label={t.autoTitleLabel}
          hint={t.autoTitleHint}
          checked={settings.autoTitleDocuments}
          onChange={(v) => setSettings({ autoTitleDocuments: v })}
        />
        <ToggleRow
          label={t.aiDiaryLabel}
          hint={t.aiDiaryHint}
          checked={settings.enableMagicDiary}
          onChange={(v) => setSettings({ enableMagicDiary: v })}
        />
      </SettingsGroup>
      <SettingsGroup title={zh ? "语音服务" : "Speech services"}>
        <MediaSettings language={settings.language} />
      </SettingsGroup>
    </>
  );
}
