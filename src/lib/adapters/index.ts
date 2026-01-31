/**
 * Adapters Index
 *
 * Register all available adapters here.
 * Import this file to ensure adapters are registered.
 */

// Core types
export * from "./types"

// Adapters - import to register
import "./intercom"

// Future adapters:
// import "./github"
// import "./linear"
// import "./zendesk"
// import "./neuphlo"

// Re-export for convenience
export { intercomAdapter } from "./intercom"
