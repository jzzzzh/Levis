import { FootprintLayer } from "../../ai/magic-diary/FootprintLayer";
// The Magic Diary's aged-paper skin for the whole window, applied by
// html[data-magic-diary]: it covers the chrome as well as the page.
import "../../theme/magic-diary-page.css";

/** The Magic Diary's room: loaded only once the diary is switched on. */
export function DiaryRoom() {
  return <FootprintLayer />;
}
