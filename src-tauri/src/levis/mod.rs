//! Levis: the fork's features on top of upstream Textus, kept apart so a
//! rebase onto upstream touches as little of its code as possible. Media
//! (speech, dictation, image jobs) is `crate::media`; the AI diary and the
//! external agent engines are `ai::diary` and `ai::runtime`. Upstream files
//! only carry the hooks: the module lines, `with_levis_commands!` in lib.rs,
//! dictation's window cleanup, ai_agent_message's engine hand-off and
//! clear_all_drafts' call into workspace_snapshots.

pub mod project_entries;
pub mod workspace_snapshots;

/// The app's invoke handler with the fork's commands in front of the plugin
/// commands and the ones lib.rs lists. Called from the frontend with plain
/// `invoke` (platform/ipc-call.ts), so none are in the specta bindings.
#[macro_export]
macro_rules! with_levis_commands {
    ($($rest:tt)*) => {
        $crate::with_plugin_commands![
            $crate::ai::diary::ai_diary_reply,
            $crate::levis::project_entries::list_project_entries,
            $crate::levis::project_entries::project_folder,
            $crate::levis::workspace_snapshots::save_workspace_snapshot,
            $crate::levis::workspace_snapshots::load_workspace_snapshot,
            $crate::levis::workspace_snapshots::clear_workspace_snapshot,
            $crate::levis::workspace_snapshots::take_workspace_snapshots,
            $crate::media::provider::media_provider_status,
            $crate::media::provider::media_configure_provider,
            $crate::media::provider::media_cancel,
            $crate::media::speech::media_transcribe,
            $crate::media::speech::media_synthesize,
            $crate::media::dictation::dictation_start,
            $crate::media::dictation::dictation_stop,
            $crate::media::jobs::media_start_image,
            $crate::media::jobs::media_image_jobs,
            $crate::media::jobs::media_image_prompt,
            $crate::media::jobs::media_rebase_image_assets,
            $crate::media::jobs::media_cancel_image,
            $crate::media::jobs::media_cancel_image_generation,
            $crate::media::jobs::media_prepare_image,
            $crate::media::jobs::media_finish_image,
            $($rest)*
        ]
    };
}

/// Write mode's rule for facts the request needs but the model doesn't have:
/// a blank the author fills in with one click (the editor's blank filler).
/// shared.residue lets these through.
pub(crate) const BLANKS_INSTRUCTION: &str = "Never invent a fact the text needs but you don't have - a date, a venue, a name, a number, a price, a contact: write a blank in full-width brackets naming what goes there, such as 【开幕日期】 or 【Opening date】, and keep it as it is when you check the text. The author fills each blank with one click.";
