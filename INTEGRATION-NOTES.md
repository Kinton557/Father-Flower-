# Integration notes (what was changed when the four builds were merged)

Written new: `shared/firebase.js`, `shared/auth.js`, `shared/ui.js`, `shared/ui.css`, `firestore.rules`, `dashboard.html`, `404.html`, `README.md`, logo and link-preview image.

Fixed so the parts agree with each other:
- Admissions: the public form saves the guardian as `name` and boarding inside `applicant`; the admin page now reads both.
- Timetable: admin and deputy save `slots[{day,start,end,subjectId}]`; the learner page now reads that shape.
- Notices sent to one family (exeat updates, summons) were visible to every parent. They now use audience `direct` plus `targetUids`, and the learner/parent notice loader fetches them separately.
- Learner results are only shown once the term report is published (page and rules both enforce it).
- Dark-mode blocks removed from dashboard styles so every page looks the same.
- Password reset (needs a server in plain Firebase) is done by issuing a fresh login and moving the records over; see `shared/auth.js`.
- Public site logo box changed from a circle to a rounded square so the whole emblem shows.
