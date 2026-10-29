import { useEffect, useState } from "react";
import { media, type MediaCapability } from "../../platform/ipc-levis";

/** A media capability's API key as typed, and whether one is stored. */
export function useMediaKey(capability: MediaCapability) {
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
