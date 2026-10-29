import { useEffect, useState } from "react";
import { media } from "../../platform/ipc-levis";
import type { SpeechCapability } from "../../media/provider-catalog";

/** A media capability's API key as typed, and whether one is stored. */
export function useMediaKey(capability: SpeechCapability) {
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => {
    let active = true;
    void media
      .keyStatus(capability)
      .then((value) => {
        if (active) setHasKey(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [capability]);
  return { key, setKey, hasKey, setHasKey };
}
