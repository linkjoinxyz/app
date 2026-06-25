import { PublicClientApplication } from '@azure/msal-browser'

export const MS_CLIENT_ID = 'a7ed330f-b382-489b-94fd-c398260cf852'
export const MS_REDIRECT_URI = `${window.location.origin}/auth-callback.html`

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: MS_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: MS_REDIRECT_URI,
  },
  cache: { cacheLocation: 'sessionStorage' },
})

// Initialize immediately — when running inside the MSAL popup callback window,
// initialize() detects the auth response and relays it to the parent, then closes.
export const msalReady = msalInstance.initialize()
