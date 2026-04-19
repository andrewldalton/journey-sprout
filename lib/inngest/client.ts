import { Inngest } from "inngest";

/**
 * Inngest client for journeysprout. Event key and signing key come from
 * INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY (injected by Vercel's Inngest
 * integration). In dev without those, Inngest runs in a local-dev mode.
 */
export const inngest = new Inngest({ id: "journeysprout" });
