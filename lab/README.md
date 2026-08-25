# Lab

The Lab is the browser application used to execute contract cases and inspect
manual scenarios. It is not shipped in the npm package.

| Area | Purpose |
| --- | --- |
| `contract/` | executable contract routes, actions, observers, and inspectors |
| `interactive/` | manual workbench scenes and controls |
| `index.html` | Vite browser entry |

Run `npm run lab` for interactive work or `npm run verify:lab:all` for the
browser gate. Shared datasets belong to `verification/fixtures/`, not here.
