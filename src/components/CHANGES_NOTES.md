## 2026-06-25

Added `MessageToast.js` + `MessageToast.css`: background poller that shows a 20-second bottom-right toast when a message arrives in a closed conversation. Added `useAuth` import to `MessagesPanel.js` so the panel auto-closes on sign-out. Potential bug: the poll seeds on first call — if the server is slow on mount, a burst of initial messages could be missed before seeding completes.
