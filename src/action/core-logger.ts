import * as core from '@actions/core';
import { Logger } from '../sync-orchestrator.js';

/**
 * Logger adapter: maps @actions/core to the Logger interface
 */
export const coreLogger: Logger = {
  info: (msg: string) => core.info(msg),
  error: (msg: string) => core.error(msg),
  warning: (msg: string) => core.warning(msg),
};
