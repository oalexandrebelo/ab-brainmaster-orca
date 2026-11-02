#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { ControlClient } from './sdk.mjs'
import { OPERATIONS, publicError } from './contract.mjs'

const client = new ControlClient({
  url: process.env.AB_CONTROL_URL,
  tokenFile: process.env.AB_CONTROL_TOKEN_FILE
})
const server = new Server(
  { name: 'ab-brainmaster-control', version: '0.1.0' },
  { capabilities: { tools: {} } }
)
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(OPERATIONS).map(([name, operation]) => ({
    name,
    description: operation.description,
    inputSchema: operation.inputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }))
}))
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  try {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await client.call(request.params.name, request.params.arguments ?? {}, {
              signal: extra.signal
            })
          )
        }
      ]
    }
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(publicError(error)) }] }
  }
})
await server.connect(new StdioServerTransport())
