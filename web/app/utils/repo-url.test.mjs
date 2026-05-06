/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { inferRepoNameFromRemoteUrl } from './repo-url.ts'

test('infers repository name from common remote URLs', () => {
  assert.equal(inferRepoNameFromRemoteUrl('https://github.com/user/git-nest.git'), 'git-nest')
  assert.equal(inferRepoNameFromRemoteUrl('ssh://git@example.com/team/api-service.git'), 'api-service')
  assert.equal(inferRepoNameFromRemoteUrl('git@example.com:team/web.frontend.git'), 'web.frontend')
  assert.equal(inferRepoNameFromRemoteUrl('https://github.com/user/repo/'), 'repo')
})

test('returns empty string when remote URL has no usable repo segment', () => {
  assert.equal(inferRepoNameFromRemoteUrl(''), '')
  assert.equal(inferRepoNameFromRemoteUrl('https://github.com/'), '')
})
