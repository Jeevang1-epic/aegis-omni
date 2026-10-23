import { createExpressApp } from '../services/alexa-mcp-server/dist/server.js';

// Reuse the app on warm invocations; never open a listening socket in a function.
export default createExpressApp();
