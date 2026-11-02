import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { OPERATIONS, LIMITS } from './contract.mjs'

export function createOpenApi() {
  const success = {
    description: 'Runtime observation.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
  }
  const failure = (description) => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Failure' } } }
  })
  return {
    openapi: '3.1.0',
    info: {
      title: 'AB-BRAINMASTER-ORCA observation API',
      version: '0.1.0',
      description: `Seven read operations through the upstream RuntimeClient. No execution or generic RPC endpoint. HTTP request bodies are limited to ${LIMITS.bodyBytes} bytes; responses to ${LIMITS.responseBytes} bytes. Browser Origin headers are denied. Default concurrency is ${LIMITS.inFlight}; default runtime timeout is ${LIMITS.timeoutMs} ms. Client cancellation abandons the observation and keeps its server slot until the bounded runtime request settles.`
    },
    servers: [
      {
        url: 'http://127.0.0.1:{port}',
        variables: {
          port: {
            default: '8080',
            description:
              'Operator-selected loopback port; deployment requires an explicitly assigned host port.'
          }
        }
      }
    ],
    security: [{ bearerAuth: [] }],
    paths: Object.fromEntries(
      Object.entries(OPERATIONS).map(([name, operation]) => [
        `/v1/${name}`,
        {
          post: {
            operationId: name,
            summary: operation.description,
            requestBody: {
              required: true,
              content: { 'application/json': { schema: operation.inputSchema } }
            },
            responses: {
              200: success,
              400: failure('Invalid JSON, parameters or configuration.'),
              401: failure('Missing or revoked bearer credential.'),
              403: failure('Host or browser Origin denied.'),
              404: failure('Unknown endpoint.'),
              413: failure('Request body too large.'),
              415: failure('Unsupported content type or encoding.'),
              429: failure('Concurrent request limit reached.'),
              502: failure('Runtime unavailable or response too large.'),
              503: failure('Credential file unavailable or server stopping.'),
              504: failure('Runtime observation reached its time limit.')
            }
          }
        }
      ])
    ),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: '32 random bytes encoded as base64url; stored in a private file'
        }
      },
      schemas: {
        Success: {
          type: 'object',
          required: ['ok', 'contractVersion', 'result', 'runtimeId'],
          additionalProperties: false,
          properties: {
            ok: { const: true },
            contractVersion: { const: 1 },
            result: {
              description:
                'The upstream operation result, whose shape depends on the runtime capability/version.'
            },
            runtimeId: { type: ['string', 'null'] }
          }
        },
        Failure: {
          type: 'object',
          required: ['ok', 'error'],
          additionalProperties: false,
          properties: {
            ok: { const: false },
            error: {
              type: 'object',
              required: ['code', 'message'],
              additionalProperties: false,
              properties: { code: { type: 'string' }, message: { type: 'string' } }
            }
          }
        }
      }
    }
  }
}

if (process.argv.includes('--write')) {
  writeFileSync(
    fileURLToPath(new URL('./openapi.json', import.meta.url)),
    `${JSON.stringify(createOpenApi(), null, 2)}\n`
  )
}
