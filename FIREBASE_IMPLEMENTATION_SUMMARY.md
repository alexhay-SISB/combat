# Combat Firebase setup (v29)

The earlier setup instructions have been superseded.

Read SECURITY_SETUP.md for the current deployment and classroom instructions. Publish database.rules.json together with the v29 game files.

Do not use public read/write rules or blanket `auth != null` rules: anonymous sign-in does not grant teacher privileges. Keep Anonymous enabled for students and enable Google for the teacher.
