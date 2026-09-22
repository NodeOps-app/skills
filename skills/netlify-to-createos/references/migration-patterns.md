# Netlify Migration Patterns

Common code patterns encountered during Netlify → CreateOS migration,
with recommended actions for the AI agent.

---

## 1. Netlify Functions → REST Endpoints

### Netlify Pattern (exports.handler)

```javascript
// netlify/functions/hello.js
exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello!" }),
    headers: { "Content-Type": "application/json" }
  }
}
```

### CreateOS Equivalent (Express)

```javascript
// api/hello.js (or Express route)
import express from 'express'
const app = express()

app.get('/api/hello', (req, res) => {
  res.json({ message: "Hello!" })
})
```

### Key differences to flag:
- `event.queryStringParameters` → `req.query`
- `event.pathParameters` → `req.params`
- `event.body` → `req.body` (with body parser)
- `context.clientContext` → Use auth middleware
- Multiple functions → Single Express app with multiple routes

---

## 2. Netlify Environment Variables

### Environment variable access patterns

```javascript
// Netlify
const apiUrl = process.env.URL  // Netlify-specific

// CreateOS
const apiUrl = process.env.CREATEOS_DEPLOYMENT_URL  // CreateOS equivalent
```

### Flag list:
| Netlify Expression | Action |
|--------------------|--------|
| `process.env.URL` | Replace with `process.env.CREATEOS_DEPLOYMENT_URL` |
| `process.env.DEPLOY_URL` | Replace with `process.env.CREATEOS_DEPLOYMENT_URL` |
| `process.env.DEPLOY_PRIME_URL` | Replace with `process.env.CREATEOS_DEPLOYMENT_URL` |
| `process.env.CONTEXT` | Remove or hardcode |
| `process.env.NETLIFY` | Remove |
| `process.env.NETLIFY_DEV` | Remove |
| `process.env.NETLIFY_LOCAL` | Remove |

---

## 3. Netlify Redirects → App-Level Routing

### Next.js (next.config.js)

```javascript
// Instead of netlify.toml redirects:
// [[redirects]]
//   from = "/blog/*"
//   to = "/news/:splat"
//   status = 301

module.exports = {
  async redirects() {
    return [
      {
        source: '/blog/:path*',
        destination: '/news/:path*',
        permanent: true,
      },
    ]
  }
}
```

### Express (app.js)

```javascript
// Instead of netlify.toml redirects:
app.get('/old-path', (req, res) => {
  res.redirect(301, '/new-path')
})

// Proxy pattern:
app.use('/api/*', async (req, res) => {
  const response = await fetch(`https://api.example.com${req.originalUrl}`)
  const data = await response.json()
  res.json(data)
})
```

---

## 4. Netlify Functions with middleware

### Netlify middleware pattern

```javascript
// netlify/functions/with-auth.js
const withAuth = (handler) => async (event, context) => {
  // auth check
  return handler(event, context)
}
```

### CreateOS equivalent

```javascript
// Express middleware
const withAuth = (req, res, next) => {
  // auth check
  next()
}

app.get('/api/protected', withAuth, (req, res) => {
  res.json({ secret: "data" })
})
```

---

## 5. Large Assets / Media

Netlify Large Media → CreateOS guidance:
- Migrate assets to object storage (AWS S3, Cloudflare R2, etc.)
- Update asset URLs in the codebase
- Use CDN for asset delivery

---

## 6. Netlify Forms → External Service

```javascript
// Instead of Netlify Forms:
// <form netlify>
//   <input name="email" />
// </form>

// Use Formspree or similar:
// <form action="https://formspree.io/f/your-id" method="POST">
//   <input name="email" />
// </form>
```

---

## 7. Complete Function Migration Example

### Netlify (before)

```javascript
// netlify/functions/subscribe.js
const stripe = require('stripe')(process.env.STRIPE_KEY)

exports.handler = async (event) => {
  const { email, plan } = JSON.parse(event.body)

  const customer = await stripe.customers.create({ email })

  return {
    statusCode: 200,
    body: JSON.stringify({ customerId: customer.id })
  }
}
```

### CreateOS (after)

```javascript
// app.js
import express from 'express'
import Stripe from 'stripe'

const app = express()
app.use(express.json())

const stripe = new Stripe(process.env.STRIPE_KEY)

app.post('/api/subscribe', async (req, res) => {
  const { email, plan } = req.body

  const customer = await stripe.customers.create({ email })

  res.json({ customerId: customer.id })
})

export default app
```
