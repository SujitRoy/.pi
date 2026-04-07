# REST API & Web Development Skill

When building REST APIs or web applications:

## API Design
- Follow RESTful conventions (GET=read, POST=create, PUT=update, DELETE=remove)
- Use proper HTTP status codes:
  - `200` OK, `201` Created, `204` No Content
  - `400` Bad Request, `401` Unauthorized, `403` Forbidden, `404` Not Found
  - `422` Unprocessable Entity, `500` Internal Server Error
- Version APIs: `/api/v1/resource`
- Use pagination for list endpoints: `?page=1&limit=20`
- Return consistent JSON structure: `{ data, error, meta }`

## Security
- NEVER hardcode secrets/API keys — use environment variables
- Implement authentication middleware (JWT, OAuth, session-based)
- Add rate limiting to prevent abuse
- Configure CORS properly (whitelist origins, don't use `*` in production)
- Sanitize and validate ALL inputs (use Zod, Joi, Pydantic, etc.)
- Use HTTPS in production
- Add request size limits

## Architecture
- Use MVC or layered architecture (routes → controllers → services → repositories)
- Implement proper error handling middleware
- Add logging (Winston, Morgan, or equivalent)
- Use dependency injection for testability
- Add health check endpoint: `GET /health`
- Separate concerns: routes, controllers, services, models, middleware
- Use DTOs (Data Transfer Objects) for request/response validation

## Performance
- Add caching where appropriate (Redis, in-memory)
- Use connection pooling for databases
- Implement database query optimization (indexes, select only needed fields)
- Use async/await for I/O operations
- Add compression middleware for responses
