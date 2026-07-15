# Deploying the LinkJoin extension across a school's fleet

This doc is for Google Workspace / Chrome Enterprise admins deploying the LinkJoin
extension to managed Chromebooks or managed Chrome browsers org-wide, rather than
having students install it individually.

## Prerequisite

The extension's stable ID is derived from the `key` field already present in
`manifest.json`. It does not change across reinstalls or version bumps, so it's
safe to reference in policy before or after publishing.

Zero-touch login (see below) requires a Google Cloud OAuth "Chrome Extension"
client ID to already be configured in the shipped `manifest.json`'s `oauth2.client_id`
field. If that hasn't been set up yet, do that first: see the extension's main
implementation notes for details on creating that client.

## Distribution: pick one

Force-installing an extension requires it to be reachable at an update URL. Two
options:

1. **Chrome Web Store**: publish the extension publicly, or as an unlisted/private
   listing restricted to your Workspace domain (Web Store → Visibility options).
   Simplest path if you're comfortable with a Store listing.
2. **Self-hosted update manifest**: host a small XML update manifest file
   yourself and point policy at that URL instead. More setup, but keeps
   distribution entirely outside the Store.

Pick whichever fits your org's constraints. The force-install policy step below
is identical either way, only the URL differs.

## Force-install via the Admin console

1. Go to **Admin console → Devices → Chrome → Apps & Extensions → Users & browsers**.
2. Select the target organizational unit (e.g. a specific school or grade-level OU).
3. Add the extension by its ID (from `manifest.json`'s `key`) or by Chrome Web
   Store URL if published there.
4. Set the installation policy to **Force install**.

This corresponds to the `ExtensionInstallForcelist` policy under the hood, with
value format:

```
<extension_id>;<update_url>
```

Once applied, the extension installs automatically on every managed device in
that OU with no student action required.

## Completing zero-touch login

Force-install alone gets the extension onto every device, but the *first* Google
sign-in attempt will still show a one-time consent screen unless the OAuth client
is pre-trusted. To make sign-in silent from the very first launch:

1. Go to **Admin console → Security → API Controls → App access control**.
2. Add the extension's OAuth client ID (the same one in `manifest.json`'s
   `oauth2.client_id`) as a **trusted app**.

With both force-install and the trusted-app entry in place, a student on a
managed Chromebook gets the extension installed and signed into their existing
LinkJoin account with zero manual steps: install, open a LinkJoin-scheduled
meeting, done.

## What doesn't need admin configuration

The context-menu "Add to LinkJoin" / "Bookmark this link" actions, the
Join-now/Skip-today notification buttons, and the toolbar meeting-count badge
all work identically post-install with no additional org-level setup.
