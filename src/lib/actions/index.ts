/**
 * Actions Module
 *
 * User-configurable rules for automating CX workflows.
 */

// Types
export * from "./types"

// Parser
export { parseAction, parseActionLocal, PARSER_SYSTEM_PROMPT } from "./parser"

// Executor
export {
  executeAction,
  runActions,
  shouldRunAction,
  type ExecutionContext,
  type ExecutionResult,
  type OutputResult,
} from "./executor"
