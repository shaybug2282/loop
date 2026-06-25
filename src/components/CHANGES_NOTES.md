## 2026-06-25

Added `NotificationCenter.js/css` (global bell, fixed top-right), `GroupsWidget.js/css` (create/list/edit groups), `GroupChatPanel.js/css` (group messaging overlay), `GroupChatContext.js`. Updated `messageCrypto.js` with `sendDm()` utility. Potential bugs: group icon stored as base64 data URL in DB — large images will exceed Supabase row size limits; consider migrating to Supabase Storage for production. Group chat messages use server-side AES-256-GCM (not E2E) since group key distribution is unsupported.
