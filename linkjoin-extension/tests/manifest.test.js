import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(here, '..', 'manifest.json'), 'utf8'))

describe('manifest.json', () => {
    // ACTION REQUIRED: this test fails until the real Chrome extension OAuth
    // client id is pasted into manifest.json. It must match the backend's
    // GOOGLE_CHROME_CLIENT_ID, which auth.py already accepts as an audience.
    //
    // Why it is worth failing over: there is no build step for this extension, so
    // the source directory is what ships, placeholder and all. background.js's
    // zeroTouchGoogleLogin catches the resulting getAuthToken failure and returns
    // false, so silent Google sign-in simply never works and nothing reports why.
    it('has a real OAuth client id, not the scaffold placeholder', () => {
        const clientId = manifest.oauth2?.client_id ?? ''
        expect(
            clientId,
            'manifest.json still ships the scaffold OAuth placeholder; paste the real client id',
        ).not.toMatch(/REPLACE_WITH/i)
        expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/)
    })
})
