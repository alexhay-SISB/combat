# Combat v29: secure classroom access

Prepared for **alexander.hay@sisbschool.com**. This release requires both the updated website and `database.rules.json`. Do not publish these rules while students are still playing v28.

## One-time setup and deployment

1. In Firebase Console, select **combat-29fb0**. Under **Realtime Database → Data**, export the database JSON as a backup. Also save a copy of the current Rules tab.
2. Under **Authentication → Sign-in method**, enable **Google**, choose the project support email, and save. Leave **Anonymous** enabled for students.
3. Under **Authentication → Settings → Authorised domains**, add **alexhay-sisb.github.io** if it is missing. Enter only the hostname, without `https://` or `/combat`.
4. Between classes, upload/merge the v29 website files into the repository. Wait for GitHub Pages deployment to finish. Hard-refresh the teacher page and sign in with **alexander.hay@sisbschool.com**. Confirm the teacher dashboard opens. Do not start a class yet.
5. In **Realtime Database → Rules**, replace the entire rules document with the exact contents of **database.rules.json**, then click **Publish**. These are Realtime Database rules, not Firestore rules.
6. Refresh the teacher page and two student devices. Each student enters a name and presses Join. Approve both requests on the teacher dashboard. Play a short round and check scores, the spectator view, and player removal before using it with the class.

No database deletion or data migration is needed. Existing player IDs and scores are kept when the matching name is approved. Old devices must refresh to v29 before joining.

## Everyday use

- Teacher: sign in with the specified Google account. Other Google accounts are denied management access by the database, even if someone edits the website code.
- Students: no email or password. Each browser/device receives a separate anonymous ID. Approve it once; it can rejoin under its approved name while membership remains.
- Names already in the roster are linked to the approved device. A second device cannot take over an owned name. For a replacement device, remove the old player first, then approve the new request; the player's scores remain.
- Keep the teacher dashboard open during play. Hosts submit their match result; the teacher dashboard applies each player’s shared statistics once, using an atomic update and a saved match marker. Pending results are processed when the dashboard reconnects, provided the round has not been replaced or reset.
- Removing a player revokes that device's access. It must request approval again. Wipe Everything removes the class data and all memberships; it requires teacher access and still asks for confirmation.
- Teacher-created and sample players must join and be approved on their devices before they can play in a multiplayer pairing.

## What the rules allow

There is no public database read and no blanket authenticated write. Even the teacher is restricted to `tournaments/default`, not unrelated database paths.

Unapproved users can submit and read only their own join request and read their own approval. Approved students can read the class roster, questions, pairings and version; toggle their own player's active status; read their assigned match; and write their own inputs and quiz score. Only the assigned host can broadcast that match's state or submit its single result. Students cannot edit shared statistics, pairings, questions, memberships, or other players.

The existing game still uses one student device as the match host. This limits access and prevents cross-class data manipulation; it is not server-authoritative anti-cheat. A modified host can misreport its own match. Approval requests are public by necessity and can be spammed; decline unexpected requests. Do not approve unknown devices.

## Testing completed

- 22 integration/security tests against the actual Firebase Realtime Database emulator, including denial tests, legacy roster linking, rejoin, pairings, quiz/input ownership, match result validation, concurrent teacher result processing, reset and wipe.
- Chromium browser test with three isolated sessions, the game's Firebase **10.4.0** scripts, and Authentication/Database emulators: teacher sign-in gate, bulk roster entry, CSV question sync, student approvals, correct quiz answers, live movement and firing, spectator, results, next round, reset, removal and wipe. See `tests/browser.cjs` for the exact flow.
- Production Google account sign-in and your school's devices/network still need the short deployment check above. No production Firebase data or rules were changed by these tests.

Developer commands: `npm ci`, then `npm test`. For browser tests: `npx playwright install chromium`, then `npm run test:browser`. Tests use only the `demo-combat-security` emulator project. Java 17+ is required for the pinned local database emulator. In proxy environments, ensure local emulator connections do not go through an external HTTP proxy.

## Troubleshooting

- **Google provider disabled:** enable Google in Authentication; keep Anonymous enabled.
- **Unauthorised domain:** add the GitHub Pages hostname above.
- **Wrong teacher account:** choose the exact account shown on the sign-in page. It must be a verified Google account. A school administrator may need to allow Google sign-in for the application.
- **Waiting for approval:** open the signed-in teacher dashboard and approve the device. A request times out after two minutes; press Join again if needed.
- **Permissions denied after deployment:** confirm both pages show v29, Google sign-in uses the correct account, and the complete matching rules were published. Do not fix this by restoring public or blanket authenticated rules.

These changes address the broad permissions described in Firebase's email. Existing emails remain in your inbox, and Firebase may take time to re-evaluate published rules. This package does not disable alert emails.

References: https://firebase.google.com/docs/auth/web/google-signin · https://firebase.google.com/docs/database/security · https://firebase.google.com/docs/rules/unit-tests
