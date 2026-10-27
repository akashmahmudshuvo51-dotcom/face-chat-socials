# Face-Chat Social — full starter scaffold

This is a multi-file starter for a social-media web app using Firebase Authentication, Cloud Firestore and Cloud Storage. It is **not** a production-ready Facebook clone.

## Included in this starter
- Email/password signup and login
- Profile display name, bio and profile-photo URL
- Text posts and image/video upload (20 MB per file)
- Like/unlike and comments
- Friend request, accept/reject, friend list
- One-to-one chat between friends
- Stories with 24-hour expiry metadata
- Admin panel entry point gated by Firebase Auth custom claim `admin: true`
- Firestore and Storage rules to review and deploy

## Upload files from an Android phone
1. Open your GitHub repository.
2. Use **Add file → Upload files**.
3. Upload `index.html`, `styles.css`, `app.js`, `firestore.rules`, and `storage.rules`.
4. Commit the files.

## Firebase setup
1. Authentication → Sign-in method → enable Email/Password.
2. Firestore Database → Rules: review and publish `firestore.rules`.
3. Storage → Rules: review and publish `storage.rules`. Firebase Storage may require a billing-enabled plan depending on current Firebase terms/project eligibility. Do not enable billing if your budget is strictly zero; media uploads may then be unavailable.
4. In Authentication settings, add the hosted site domain to Authorized domains.
5. Host the site on HTTPS static hosting. GitHub repository pages do not execute raw module files by themselves. GitHub Pages can serve static HTML, CSS and JS; ensure the site is enabled in repository settings.

## Important limitations and review items
- This is a starter. It has not been deployed or tested against your live Firebase project from this environment.
- Firestore query/index behavior and the security rules should be tested with two test accounts in Firebase Emulator or Rules Playground before launch.
- The friend-acceptance rule is a starter and should be tightened for a production system to validate the exact matching request and member pair.
- Like count uses a client-updated counter and is vulnerable to race conditions/abuse. Production use should compute counts with trusted server-side logic or avoid relying on a mutable client counter.
- Stories include an expiration timestamp but are not automatically deleted by this client. Configure a Firestore TTL policy if available, or clean them up with trusted backend logic.
- Profile images currently use an HTTPS URL field; post/story image and video files use Firebase Storage.
- Admin permissions must be granted by a trusted environment using Firebase Admin SDK custom claims. Never let a browser client assign itself admin privileges.
- Avoid publishing any service account key or private Admin SDK credentials.
- This app has no end-to-end encryption, robust abuse reporting pipeline, push notifications, video transcoding, or production moderation yet.
- Free plans have usage limits. Storage, hosting, database reads/writes and bandwidth can exceed free quotas or have eligibility/billing requirements. Verify current terms before enabling paid billing.
