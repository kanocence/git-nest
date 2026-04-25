export default defineAgentHandler(async () => {
  const agent = useAgentRuntime()
  const runs = agent.db.runs.list(100)
  return { runs, total: runs.length }
})
