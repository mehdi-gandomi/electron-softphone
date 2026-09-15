# Changelog

Release steps: see [RELEASE.md](RELEASE.md).

---

## 1.0.3

- Login and shift APIs use `user` (SSO) + `member` (person); occupancy is keyed by 10-digit national code.
- Login reads today’s shifts from `data.shifts` and the current window from `data.shift`.
- National codes keep leading zeros; Persian digits are converted before requests.
- Outside-shift login shows the server start/end times and does not open a session.

## 1.0.2

- Device picker for microphone and speaker, with a sound test.
- Settings audio tab lists real input/output devices.
- Call audio and ringtone follow the selected devices.
