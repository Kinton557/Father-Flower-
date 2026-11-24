# Father Flower School System

Public website plus portals for admin, head, deputy, bursar, SDC, boarding, teachers, learners and parents.
Plain HTML, CSS and JavaScript on GitHub Pages, with Firebase for logins and data. No build step.

Live address now: `https://kinton557.github.io/Father-Flower-/`

## 1. Put the files on GitHub
Upload everything in this zip to the **root** of the repo, keeping the folders (`admin/`, `shared/`, `assets/` and so on) and the hidden `.nojekyll` file.
- Computer: unzip, then GitHub → Add file → Upload files → drag all the folders and files in.
- Phone (Termux): `pkg install git unzip`, clone the repo, `unzip -o the-zip.zip -d repo-folder`, then `git add -A && git commit -m "Father Flower system" && git push`.

## 2. Publish the security rules (important)
Firebase console → Firestore Database → **Rules** → delete what is there → paste all of `firestore.rules` → **Publish**.
Until you do this the database stays locked and nothing will load.

## 3. Create the first admin (one time, by hand)
1. Firebase → Authentication → Users → **Add user**. Email: `adm001@users.fatherflower.school`, any password you will remember (8+ characters).
2. Copy that user's **UID**.
3. Firestore → Data → **Start collection** `users` → Document ID = the UID → add fields:
   `loginId` (string) `ADM001`, `fullName` (string) your name, `role` (string) `admin`, `campusId` (string) `all`, `active` (boolean) true, `mustChangePassword` (boolean) false.
4. Open the site → Login → ID `ADM001` + your password. You land on the admin dashboard.

## 4. Set up the school (inside the admin dashboard)
1. **Seed** (`admin/seed.html`): creates the starter campuses, grading scale and subjects. Safe to run twice.
2. **Website** (`admin/website.html`): school name, motto, phones, email, hours; upload the **stamp** and **head signature** (PNG with transparent background).
3. **Academic**: terms (mark one as current), classes, subjects, allocations (teacher + class + subject).
4. **Users / Learners**: add staff, learners and parents. Each new account gets a temporary password on a printable slip. People must choose their own password the first time they sign in.
5. Teachers enter marks, then **Reports** (admin): approve and **publish**. Nothing is visible to learners or parents before publishing.

## 5. Things you should know
- **Logins:** people sign in with an ID number (for example `J0016`, `P0016`, `EC12345`). Behind the scenes it becomes `<id>@users.fatherflower.school`.
- **Google sign-in:** after someone signs in once with ID + password, they can choose **Link Google account** in the top-right menu. After that the Google button works for them.
- **Reset password:** Admin → Users → Reset password. It gives the person a new login and a new temporary password; their records move across automatically.
- **Files and photos:** Firebase Storage needs the Blaze (pay-as-you-go) plan. Until then images are shrunk and kept inside the record, and other files are limited to about 450 KB. Once Storage is on, add a document `settings/system` with `useStorage` = true and uploads switch over.
- **Indexes:** if a page shows an error mentioning “index”, open the browser console, click the link Firebase gives, and press Create. It takes a minute.
- **Hold reports while fees are owing:** admin → Settings, `holdReportsIfOwing`. This is checked in the page, not by the database rules.
- **Campus separation** is done by the pages; the rules enforce roles (who can do what). Tighten per-campus rules later if the school needs hard separation.
- **Logo:** `assets/logo.png` is a small crop of the school’s Facebook logo. Replace it with the official high-resolution file (same name). Add photos in `assets/photos/` (see `assets/README.md`).
- **Not tested against a live Firebase project.** Everything was checked for code errors and matching data names, but please click through each role once and report anything odd.

## Folders
`/` public site and login · `admin/ head/ deputy/` management · `teacher/ learner/ parent/` teaching and learning · `bursar/ sdc/ boarding/` money and boarding · `shared/` Firebase, login, interface · `firestore.rules` security rules
