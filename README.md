# Admin Broadcast Bot in TypeScript

This bot allows administrator to broadcast messages on Wire - the administrator writes the message to this bot and the bot broadcast that message to every conversation the bot is in.

## Development

The bot is based on the JavaScript runtime [Deno](https://deno.land/) and [Oak](https://github.com/oakserver/oak) middleware.

### Configuration

The bnot uses few environmental variables for its configuration, for complete list see first lines of the [code](app.ts).
