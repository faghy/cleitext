# Security policy

The same policy, in a friendlier form and in Italian too, is at [cleitext.com/security](https://cleitext.com/security) ([italiano](https://cleitext.com/it/sicurezza)).

## Releases and release lines

- A **release** is a minor version with its patches: 0.64.0, 0.64.1, 0.64.2… (from 1.0 on: 1.4.0, 1.4.1…).
- A **release line** is a major version. Before 1.0 the whole 0.x series is one line; from 1.0 each major version (1.x, 2.x…) is a line.

New minor versions come out very often, sometimes several a day, and each one is a safe, compatible update (see below), so support is promised per release and per line, not for every minor version ever published.

## Supported versions

| Version                                                                                         | Bug fixes  | Security fixes                               |
| ----------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------- |
| The latest release (e.g. 0.64.x)                                                                | yes        | yes                                          |
| The previous release (e.g. 0.63.x)                                                              | yes        | yes, as a patch release when the fix applies |
| Older releases of the current line                                                              | no: update | no: update                                   |
| The last release of the previous line, after a new line comes out (e.g. the last 0.x after 1.0) | no         | yes, for 6 months                            |

The same rule covers the official plugins and themes of the catalog (the latest version and the previous one) and Cleitext Toolkit for Plesk (the latest release and the previous one).

## Reporting a vulnerability

Report vulnerabilities privately, never in a public issue:

- through GitHub's **Report a vulnerability** button in the [Security tab](https://github.com/faghy/cleitext/security) of this repository (a private advisory);
- or by email to **site@cleitext.com**, with "Security" in the subject.

Include the affected version, the steps to reproduce and the impact you expect.

## Response times

- Acknowledgement within **3 working days**.
- A first assessment within **7 days**.
- A fix for **critical** issues within 7 days, **high** within 14 days, **medium** within 30 days; **low** issues are fixed in a regular release.

We keep the reporter informed until the fix is out.

## Disclosure

Disclosure is coordinated. When the fix is released we publish an advisory (GitHub Security Advisories and the release notes, and a note on the cleitext.com blog for serious issues), crediting the reporter unless they prefer otherwise. We ask reporters to keep the details private until the fix is out, for 90 days at most.

## How updates are delivered

- **Updates** in the admin: super admins see a notice when a new version is published and update with one button; from SSH, `bin/cleitext update`.
- **Safe updates**: the release is checked against its SHA-256, a backup is made, the new version is started on the side and tried (ready check and a home page) before the switch. If any step fails, the site stays on the version it was running.
- **Rollback**: `cleitext rollback`, `cleitext plugin:rollback`, `cleitext theme:rollback`.
- Catalog plugins and themes update from the admin (Plugins, Appearance → Themes).
- On Plesk, Cleitext Toolkit updates and rolls back each installation from the panel, and updates itself from cleitext.com.

## How Cleitext is secured

The [OWASP ASVS checklist](docs/ASVS.md) describes the measures in place and the open items.
