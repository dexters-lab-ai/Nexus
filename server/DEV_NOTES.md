# Nexus Server Development Notes

## Project Structure

### Server-Side Models (`/server/models/`)
- Location: `/server/models/`
- Purpose: Contains server-side business logic and database interactions
- Key Characteristics:
  - Direct database access
  - Contains sensitive business logic
  - Not exposed directly to the client
  - Accessed through API endpoints

### Client-Side Models (`/src/models/`)
- Location: `/src/models/`
- Purpose: Handles client-side data and API communication
- Key Characteristics:
  - Runs in the browser
  - Communicates with server via API
  - Handles UI state and data transformations

## Billing System Architecture

### Server-Side Components
- **BillingModel.js**: Core billing logic and database operations
  - Location: `/server/models/BillingModel.js`
  - Handles token management, transactions, and usage tracking

### Client-Side Components
- **Billing.js**: Client-side billing interface
  - Location: `/src/models/Billing.js`
  - Handles UI state and API communication

## Best Practices

1. **Separation of Concerns**:
   - Keep server-side models in `/server/models/`
   - Keep client-side models in `/src/models/`

2. **Security**:
   - Never expose direct database access to the client
   - Always validate input on the server
   - Keep sensitive logic server-side

3. **Documentation**:
   - Document model purposes and responsibilities
   - Keep this file updated with architectural decisions
   - Add comments for complex business logic

## Common Patterns

### Data Flow
1. Client makes API request
2. Route handler processes request
3. Server model handles business logic and database operations
4. Response is sent back to client
5. Client model processes response and updates UI

### Error Handling
- Server models should throw appropriate errors
- Client models should handle errors gracefully
- Log all errors with sufficient context
