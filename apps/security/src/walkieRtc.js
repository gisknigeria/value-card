const turnUrls = String(import.meta.env.VITE_WALKIE_TURN_URL || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

export const WALKIE_RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    ...(turnUrls.length ? [{
      urls: turnUrls,
      username: import.meta.env.VITE_WALKIE_TURN_USERNAME || "",
      credential: import.meta.env.VITE_WALKIE_TURN_CREDENTIAL || "",
    }] : []),
  ],
};
