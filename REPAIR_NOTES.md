# v29 security repair

- Google teacher sign-in restricted by verified token to alexander.hay@sisbschool.com. Separate anonymous student sessions and teacher-approved membership.
- Default-deny database rules with per-player and per-match permissions.
- Preserve existing player identities and scores when approving devices.
- Only the teacher applies shared results, atomically and once; clients cannot change other players or the question bank.
- Preserve both networked quiz scores in match results (the opponent’s score previously saved as zero).
- Fix cloud stat reset, failed-wipe reporting, spectator listener cleanup and Firebase empty bullet lists. Stop host simulation immediately at match end so the final state is not overwritten.
- Escape player names and spectator values when rendering HTML.
- Deploy the matching code and rules using SECURITY_SETUP.md. Existing Firebase config, controls, scoring, visuals, and question format are retained.

# Multiplayer repair — build 28

The teacher and student previously generated different local IDs for the same
name. The teacher then kept its local ID when merging Firebase players, so the
student could not recognise the teacher's pairing. Student lobby counts also
came from device-local storage, and local polling could undo a cloud pairing.

The repair resolves names to one shared Firebase ID using a transaction,
subscribes both pages to the shared roster, waits for registration confirmation,
preserves scores on rejoin, synchronises leave/reset/completion, and keeps local
polling from overriding Firebase. Read/write failures now show a visible message.
The visual design and quiz/combat rules are unchanged.

## Firebase sign-in setup (required for build 28)

The current database rules require `auth != null` for writes. Build 28 loads the
Firebase Authentication SDK and signs each browser in anonymously before
registration or other writes. In Firebase project combat-29fb0, open
Authentication, then Sign-in method, and enable Anonymous. Keep the existing
database rules. No student email address or password is required.

## Install

Upload the contents of this folder to the root of alexhay-SISB/combat, replacing
the existing files. Keep js/ and css/ as folders. After GitHub Pages deployment
finishes, reload teacher.html and student.html on every device. The student
corner badge should say v28. Students should use distinct names and enter the
same name when rejoining. All pages must be from the same deployment.

## Verification

Run `node tests/multiplayer.cjs` from this folder. Nineteen regression checks pass
using isolated JavaScript contexts and an in-memory Firebase test double.
Three targeted identity/pairing checks reproduce failures in the original code.
All JavaScript files pass syntax checks and local HTML asset links resolve.

These checks do not prove live Firebase access, security-rule permissions,
browser rendering, or real-device network latency. Browser access was blocked
by the editing session's approval policy. No live database rules were changed.
If the deployed game displays a Firebase permission-denied message, the project
owner must inspect the Realtime Database rules in project combat-29fb0; source
code cannot override denied database access.
