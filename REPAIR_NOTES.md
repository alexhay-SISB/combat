# Multiplayer repair — build 27

The teacher and student previously generated different local IDs for the same
name. The teacher then kept its local ID when merging Firebase players, so the
student could not recognise the teacher's pairing. Student lobby counts also
came from device-local storage, and local polling could undo a cloud pairing.

The repair resolves names to one shared Firebase ID using a transaction,
subscribes both pages to the shared roster, waits for registration confirmation,
preserves scores on rejoin, synchronises leave/reset/completion, and keeps local
polling from overriding Firebase. Read/write failures now show a visible message.
The visual design and quiz/combat rules are unchanged.

## Install

Upload the contents of this folder to the root of alexhay-SISB/combat, replacing
the existing files. Keep js/ and css/ as folders. After GitHub Pages deployment
finishes, reload teacher.html and student.html on every device. The student
corner badge should say v27. Students should use distinct names and enter the
same name when rejoining. All pages must be from the same deployment.

## Verification

Run `node tests/multiplayer.cjs` from this folder. Fifteen regression checks pass
using isolated JavaScript contexts and an in-memory Firebase test double.
Three targeted identity/pairing checks reproduce failures in the original code.
All JavaScript files pass syntax checks and local HTML asset links resolve.

These checks do not prove live Firebase access, security-rule permissions,
browser rendering, or real-device network latency. Browser access was blocked
by the editing session's approval policy. No live database rules were changed.
If the deployed game displays a Firebase permission-denied message, the project
owner must inspect the Realtime Database rules in project combat-29fb0; source
code cannot override denied database access.
