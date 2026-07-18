/**
 * Jest stub for @actions/github.
 *
 * @actions/github@8 depends on the ESM-only @octokit/* majors, which Jest's
 * CJS module registry cannot require() (Node >= 22 handles require(esm)
 * natively at runtime — this is purely a Jest limitation). Tests never use a
 * real Octokit: reviewer tests construct the class and then overwrite the
 * private `octokit` field with a fake. Mapped in jest.config.js.
 */

export function getOctokit(_token: string): Record<string, unknown> {
  return {};
}

export const context = {
  repo: { owner: 'test-owner', repo: 'test-repo' },
  eventName: 'pull_request',
  payload: {},
  sha: 'test-sha',
};
