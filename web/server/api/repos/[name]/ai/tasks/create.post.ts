import type { TaskCreateInput } from '#shared/types/task-creator'
import { buildTaskYaml } from '../../../../../utils/agent/task-creator'

export default defineAgentHandler(async (event): Promise<unknown> => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const body = await readBody(event)
  const input = (body && typeof body === 'object' ? body : {}) as TaskCreateInput & { ref?: unknown }
  const agent = useAgentRuntime(event)
  const ref = 'ref' in input && typeof input.ref === 'string' && input.ref.trim()
    ? input.ref.trim()
    : getDefaultRef(agent.config, name)

  const task = buildTaskYaml(input)
  writeTaskFile(agent.config, name, ref, task.filePath, task.content)

  return {
    repo: name,
    ref,
    filePath: task.filePath,
    content: task.content,
    message: 'Task file created',
  }
})
