export const SPLASH_SESSION_KEY = 'sg-splash'

/** Inline script for <head>: skip the splash for the rest of the browser session (runs before first paint). */
export const SPLASH_SKIP_SCRIPT = `try{if(sessionStorage.getItem('${SPLASH_SESSION_KEY}'))document.documentElement.setAttribute('data-splash','off')}catch(e){}`
