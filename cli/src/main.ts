import { defineCommand, runMain } from 'citty'
import loginCmd from './commands/login.ts'
import pullCmd from './commands/pull.ts'
import pushCmd from './commands/push.ts'
import remoteAdd from './commands/remote/add.ts'
import repoCreate from './commands/repo/create.ts'
import repoList from './commands/repo/list.ts'
import statusCmd from './commands/status.ts'

const repoCmd = defineCommand({
  meta: { description: 'Manage repositories on the Git Nest server' },
  subCommands: {
    list: repoList,
    create: repoCreate,
  },
})

const remoteCmd = defineCommand({
  meta: { description: 'Manage Git remotes' },
  subCommands: {
    add: remoteAdd,
  },
})

const main = defineCommand({
  meta: {
    name: 'git-nest',
    version: '0.1.0',
    description: 'Git Nest CLI — manage your self-hosted Git repos from the terminal',
  },
  subCommands: {
    login: loginCmd,
    repo: repoCmd,
    remote: remoteCmd,
    status: statusCmd,
    push: pushCmd,
    pull: pullCmd,
  },
})

runMain(main)
