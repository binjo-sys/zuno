# ZUNO

ZUNO is an original social messaging application: **Connect. Chat. Share.**

## Current foundation
- Responsive chat UI
- Conversation search
- Direct/group conversation views
- Message composer
- Mobile navigation
- Original ZUNO branding

## Production architecture
The UI is intentionally separated from the future messaging backend. The production version will add:

1. Authentication and user profiles
2. Persistent conversations and messages
3. Real-time message delivery
4. Presence and typing indicators
5. Media/file storage
6. Push notifications
7. Group management
8. Blocking/reporting and privacy controls
9. Voice/video calling

**Important:** the current frontend demo stores messages only in browser memory. It is not yet a multi-user messaging service.

## Development
```bash
npm install
npm run dev
```

## Security
Never place server secrets, database service keys, or private API credentials in the browser bundle. Production authentication, authorization, storage rules, rate limits, and abuse controls must be enforced server-side.
