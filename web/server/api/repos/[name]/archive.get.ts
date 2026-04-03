/**
 * GET /api/repos/:name/archive — 代理 zip 包下载流
 */
import { validateRepoName } from '../../../utils/validation'
import { getRunnerBaseUrl, getRunnerHeaders } from '../../../utils/runner'
import type { H3Event } from 'h3'
import { setResponseHeader } from 'h3'

export default defineEventHandler(async (event: H3Event) => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const query = getQuery(event)
  const branch = query.branch as string | undefined

  const baseUrl = getRunnerBaseUrl()
  const path = branch
    ? `/api/repos/${name}/archive?branch=${encodeURIComponent(branch)}`
    : `/api/repos/${name}/archive`

  const headers = getRunnerHeaders()

  const controller = new AbortController()
  event.node.req.on('close', () => {
    controller.abort()
  })

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
  }
  catch (err: any) {
    if (err.name === 'AbortError') {
      return
    }
    throw err
  }

  // 透传 git-runner 返回的错误状态码
  if (!response.ok) {
    const body = await response.text()
    throw createError({
      statusCode: response.status,
      statusMessage: body || 'git-runner error',
    })
  }

  // 透传响应头
  setResponseHeader(event, 'Content-Type', response.headers.get('content-type') || 'application/zip')
  setResponseHeader(event, 'Content-Disposition', response.headers.get('content-disposition') || 'attachment')

  // 流式转发 binary 数据
  if (!response.body) {
    throw createError({ statusCode: 502, statusMessage: 'empty response from git-runner' })
  }

  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      event.node.res.write(value)
    }
  }
  catch (err: any) {
    if (err.name !== 'AbortError') {
      throw err
    }
  }
  finally {
    event.node.res.end()
  }
})
