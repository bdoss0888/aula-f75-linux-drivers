---
trigger: always_on
description: AULA F75 Linux WebHID protocol, udev permissions, and upstream fork standards.
---

# AULA F75 Linux Drivers — Hardware & Fork Rules

1. **Upstream Fork Hygiene:**
   - This repo is a fork (`origin` = `bdoss0888/aula-f75-linux-drivers`). Pull updates from `upstream`, develop on feature branches (`feat/*`, `fix/*`), and push only to `origin`.

2. **Hardware & Protocol Invariants:**
   - Distinguish the two USB PIDs explicitly: **Wired `258A:010C`** (full config protocol via WebHID vendor feature report `0x06`) vs **2.4G Dongle `3554:FA09`** (live per-key animation stream only).
   - Keep userspace access rootless via `udev/99-aula-f75.rules`; never require running Chromium or the app as root.
   - Before experimental packet writes, preserve a lighting snapshot and note `Fn+Esc` (hold ~5s) as the hardware factory reset.

3. **Verification:**
   - Validate web app changes with `cd web && bun run build` (or `npm run build`) before committing.
