## 2026-06-25

Added home button (`<Link to="/dashboard">` + lucide `Home` icon, class `home-btn`) to the top-left header of CalendarPage, TodosPage, FriendsPage, ProfilePage, and SchedulePage. Styles in `PageLayout.css`. Capped the SchedulePage notification log to 20 most-recent entries via `.slice(0, 20)` after sort.
