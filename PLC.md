# Weekly PLC

The private teacher workspace is `/admin/plc/`, linked from `/admin/`. It uses the existing Access authentication and `/api/admin/*` origin checks. Each authorized email has its own PLC records. Assignment metadata remains public curriculum information; observations and evidence never go into GitHub or static HTML.

## Private cloud saving

The `pelen-plc` D1 database and `plc_entries` table are provisioned. `wrangler.toml` binds **PLC_DB** only under `env.production`; preview environments do not access production observations. Deploy the `main` branch to activate this binding. Keep the existing Access settings for `/admin` and `/api/admin`.

For a new Cloudflare account, create a D1 database, run `migrations/0001_plc.sql`, and replace the production database ID in `wrangler.toml`. Do not put the production binding at the top level, where preview deployments would inherit it.

After deployment, sign in, create a PLC, wait for **Saved to private cloud**, then open it in another signed-in browser with the same email. Different authorized emails have separate records.

Without the binding or migration, the app explicitly reports unavailable cloud storage and retains browser drafts; it never claims that these drafts are backed up in the cloud. Browser data alone is not a backup. Export remains available.

Reference: https://developers.cloudflare.com/pages/functions/wrangler-configuration/

## Curriculum and weekly records

The existing `GROUPS` catalogue remains the source of assignment IDs, subjects, status, links, and optional `plc` metadata. The assignment publisher edits unit, learning target, success criteria, and requirements. Uploading an HTML copies recognized sections into empty fields for review; missing fields stay empty. Existing recognized curriculum sections were copied into catalogue metadata as a one-time migration. Updating HTML outside the publisher does not regenerate pedagogical metadata; update the PLC fields as part of that edit.

The PLC loads this catalogue through the authenticated projects endpoint. NOW activities are suggested. Multiple projects can be selected for one subject/week. Every PLC stores a snapshot; subsequent assignment edits and removals leave prior weekly records intact. Editing a project snapshot in a PLC does not change the public assignment.

Completion requires every quick-mode essential field and the next instructional action/date. A first PLC can mark Reassess as not applicable. Quick mode keeps populated full-mode fields visible. Blank reflections are never invented.

## Saving and recovery

Draft journals are separate for each tab, so another tab cannot replace an unsaved draft. Use **Recover browser drafts** to recover notes from a closed tab as additional PLCs. Changes are cached on this browser immediately and sent to the private API after a short pause. Server updates require the record revision; stale edits return 409 and do not overwrite another device. The UI compares versions and downloads a draft backup before resolving a conflict. Deleted records move to recoverable trash. JSON exports include records in trash; imports merge, skip identical IDs/content, and retain differing ID collisions as copies.

Use **Import backup** for the original PLC JSON file. No original teacher notes are embedded in the application source. The legacy HTML on a `file:` URL has separate browser storage and cannot be silently migrated by the website.

## Validation

Run `npm test`, `npm run build`, and `npx wrangler pages functions build --outdir .wrangler/functions --build-output-directory dist`. Automated tests cover actual SQLite writes through a D1-shaped adapter, owner isolation, optimistic concurrency, recovery, date validation, curriculum snapshots, legacy conversion, and publication preservation. Verify desktop/mobile layout and the save/reload/import/conflict flows in a local test harness; production authentication must never be bypassed to preview.

## Today’s Class and shared learning goals

Edit a project's public **Learning target** and **Success criteria** in the teacher dashboard, under **Today’s Class + PLC · Learning goals**. Put each criterion on a separate line. These fields feed new PLC snapshots and the classroom projection. The existing concise classroom goals have been preserved in the project catalogue.

`npm run build` generates the embedded public catalogue in `dist/resources/today-class.html` from `index.html` using `scripts/learning-catalog.mjs`. It never reads private PLC records. Every successful Pages deployment refreshes the board automatically, including newly added projects. Open the built `dist/` version for local use; the source HTML is a template. Do not edit generated embedded data.

Each selected project in a PLC links to **Project Today’s Class**, with the project ID preselected. The screen keeps its original typography, layout, and fullscreen controls. It shows the current published goals; private weekly edits and reflections stay in the PLC. Existing weekly snapshots are never rewritten by curriculum changes. A retired project's link displays an explicit message instead of silently projecting a different assignment. Projects missing learning goals display a notice until those fields are completed in the teacher dashboard.
