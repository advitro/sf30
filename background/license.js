// Background license helper
const VERIFY_URL = "https://shift-grabber.vercel.app/verify";

async function getDeviceId() {
  return new Promise((resolve) => {
    chrome.storage.local.get("deviceId", (data) => {
      if (data.deviceId) return resolve(data.deviceId);
      const id = crypto.randomUUID();
      chrome.storage.local.set({ deviceId: id }, () => resolve(id));
    });
  });
}
async function getUserKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get("SG_userKey", (data) => resolve(data.SG_userKey || ""));
  });
}
export async function verifyLicense() {
  const key = await getUserKey();
  const deviceId = await getDeviceId();

  if (!key) {
    await chrome.storage.local.set({ verified: false, reason: "no-key" });
    return false;
  }

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, deviceId })
    });
    const data = await res.json();
    const ok = !!data.authorized || data.ok === true;
    await chrome.storage.local.set({ verified: ok, reason: ok ? "" : (data.reason || "unauthorized") });
    return ok;
  } catch (e) {
    await chrome.storage.local.set({ verified: false, reason: "network" });
    return false;
  }
}
