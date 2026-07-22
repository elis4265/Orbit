import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { TiptapTransformer } from '@hocuspocus/transformer'
import { generateHTML, generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import * as Y from 'yjs'
import jwt from 'jsonwebtoken'
import pg from 'pg'
import { createClient } from 'redis'

const { Pool } = pg

const pool = new Pool({ connectionString: process.env.POSTGRES_URL })

// Same Redis the backend writes token revocations to (logout/reset/deactivation).
const redis = createClient({ url: process.env.REDIS_URL || 'redis://redis:6379/0' })
redis.on('error', (err) => console.error('[hocuspocus] redis error:', err.message))
await redis.connect()

const JWT_SECRET = process.env.JWT_SECRET_KEY
const INTERNAL_KEY = process.env.HOCUSPOCUS_INTERNAL_KEY
const FASTAPI_URL = process.env.FASTAPI_INTERNAL_URL || 'http://backend:8000'
const PORT = parseInt(process.env.PORT || '1234')

// Must match the extensions used in DescriptionEditor.tsx
const EXTENSIONS = [
  StarterKit,
  Image.configure({ inline: true, allowBase64: true }),
]

function taskIdFrom(documentName) {
  return documentName.replace(/^task:/, '')
}

const server = new Server({
  port: PORT,

  async onAuthenticate({ token, documentName }) {
    // Step 1 — validate JWT locally (fast, no network hop per DD-023)
    let payload
    try {
      payload = jwt.verify(token, JWT_SECRET)
    } catch {
      throw new Error('Invalid or expired token')
    }
    if (payload.type !== 'access') {
      throw new Error('Wrong token type')
    }

    // Key format matches app/services/token_blacklist.py; fail closed on Redis errors.
    if (payload.jti && (await redis.get(`blacklist:${payload.jti}`))) {
      throw new Error('Token revoked')
    }

    // Step 2 — one HTTP call to FastAPI to verify workspace membership (per DD-023)
    const taskId = taskIdFrom(documentName)
    let res
    try {
      res = await fetch(`${FASTAPI_URL}/api/v1/internal/tasks/${taskId}/access`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (err) {
      throw new Error('Access check failed: ' + err.message)
    }
    if (!res.ok) {
      throw new Error('Access denied')
    }

    return { userId: payload.sub, username: payload.username ?? 'Unknown' }
  },

  extensions: [
    new Database({
      async fetch({ documentName }) {
        const taskId = taskIdFrom(documentName)

        // Load existing Yjs binary state if available
        const { rows } = await pool.query(
          'SELECT ydoc FROM task_yjs_documents WHERE task_id = $1',
          [taskId]
        )
        if (rows.length > 0) {
          return rows[0].ydoc // Buffer from pg driver
        }

        // No Yjs state yet — seed from existing HTML description (DD-020)
        const { rows: taskRows } = await pool.query(
          'SELECT description FROM tasks WHERE id = $1',
          [taskId]
        )
        if (!taskRows.length || !taskRows[0].description) {
          return null // empty document
        }

        try {
          const json = generateJSON(taskRows[0].description, EXTENSIONS)
          const ydoc = TiptapTransformer.toYdoc(json, 'default', EXTENSIONS)
          return Buffer.from(Y.encodeStateAsUpdate(ydoc))
        } catch (err) {
          console.error('[hocuspocus] failed to seed from HTML:', err.message)
          return null
        }
      },

      async store({ documentName, state }) {
        const taskId = taskIdFrom(documentName)
        await pool.query(
          `INSERT INTO task_yjs_documents (task_id, ydoc, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (task_id) DO UPDATE SET ydoc = $2, updated_at = NOW()`,
          [taskId, Buffer.from(state)]
        )
      },
    }),
  ],

  // After storing Yjs state, sync HTML back to FastAPI so tasks.description stays current (DD-021, Q2-B)
  async onStoreDocument({ documentName, document }) {
    const taskId = taskIdFrom(documentName)
    try {
      const json = TiptapTransformer.fromYdoc(document, 'default')
      const html = generateHTML(json, EXTENSIONS)

      const res = await fetch(`${FASTAPI_URL}/api/v1/internal/tasks/${taskId}/description`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': INTERNAL_KEY,
        },
        body: JSON.stringify({ description: html }),
      })
      if (!res.ok) {
        console.error('[hocuspocus] description sync returned', res.status)
      }
    } catch (err) {
      // Non-fatal — Yjs state is already safely stored; FastAPI will catch up on next store
      console.error('[hocuspocus] description sync failed:', err.message)
    }
  },
})

server.listen()
console.log(`[hocuspocus] listening on port ${PORT}`)
